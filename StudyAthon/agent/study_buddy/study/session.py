"""The study loop's session store and state machine.

The backend owns the loop, so a client cannot implement it wrong. A session holds
the current iteration, the student's answers, the difficulty each question is at,
and the timer deadline; ``rules.py`` decides what happens next and this module
applies it. The client answers questions and renders what it is handed.

A session lives in memory. That is a deliberate v1 trade: it keeps the loop free
of Firestore and survives exactly as long as the server process, which is fine
for a study session measured in minutes. Moving it to a durable store later means
replacing ``_SESSIONS`` and the mutating methods, not the rules.

State transitions::

    active --(all questions answered)--> awaiting_reveal --(reveal)--> active
       |                                                          ^
       +--(timer expired)------------------------------------> finished

``awaiting_reveal`` is only entered when at least one answer was wrong, which is
the only situation the spec offers explanations for.
"""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field
from typing import Any, Mapping

from study_buddy.settings import MAX_QUESTIONS
from study_buddy.study.rules import (
    Attempt,
    Outcome,
    clamp_question_count,
    plan_next_iteration,
    public_views,
    requires_reveal,
)

#: Sessions are dropped this long after their last activity. A study session is
#: minutes long, so this is generous; it just stops the dict growing forever.
SESSION_TTL_SECONDS = 6 * 60 * 60

STATUS_ACTIVE = "active"
STATUS_AWAITING_REVEAL = "awaiting_reveal"
STATUS_FINISHED = "finished"

#: Every terminal reason a loop can end, reported to the client so the UI can say
#: something truthful instead of guessing.
FINISHED_TIMER = "timer_expired"
FINISHED_NOTHING_TO_DO = "no_questions_left"
FINISHED_STUDENT_LEFT = "student_ended"


class SessionError(Exception):
    """A request that cannot be served against the current session state."""


class UnknownSession(SessionError):
    """No such session, or it aged out. Distinct so the API can answer 404."""


@dataclass
class StudySession:
    session_id: str
    user_id: str
    concepts: list[dict[str, Any]] = field(default_factory=list)
    bank: list[dict[str, Any]] = field(default_factory=list)
    source_notes: dict[str, Any] = field(default_factory=dict)
    question_count: int = 1
    timer_deadline: float | None = None
    iteration: int = 1
    questions: list[dict[str, Any]] = field(default_factory=list)
    #: question_id -> selected index. ``None`` records an explicit skip, which is
    #: an ignored question rather than a wrong one.
    answers: dict[str, int | None] = field(default_factory=dict)
    status: str = STATUS_ACTIVE
    reveal_answers: bool | None = None
    finished_reason: str | None = None
    updated_at: float = field(default_factory=time.time)

    # -- timer ---------------------------------------------------------------

    def timer_expired(self) -> bool:
        return self.timer_deadline is not None and time.time() >= self.timer_deadline

    def seconds_remaining(self) -> int | None:
        if self.timer_deadline is None:
            return None
        return max(0, int(self.timer_deadline - time.time()))

    # -- iteration bookkeeping ----------------------------------------------

    def next_unanswered(self) -> dict[str, Any] | None:
        for question in self.questions:
            if question.get("id") not in self.answers:
                return question
        return None

    def outcome_for(self, question: Mapping[str, Any]) -> Outcome:
        """How one question went. ``None``/absent means ignored, not wrong."""
        qid = question.get("id", "")
        if qid not in self.answers:
            return Outcome.UNANSWERED
        selected = self.answers[qid]
        if selected is None:
            return Outcome.UNANSWERED
        if selected == question.get("correct_index"):
            return Outcome.CORRECT
        return Outcome.INCORRECT

    def attempts(self) -> list[Attempt]:
        return [
            Attempt(
                question_id=question.get("id", ""),
                difficulty=question.get("difficulty", "medium"),
                outcome=self.outcome_for(question),
            )
            for question in self.questions
        ]

    def summary(self) -> dict[str, Any]:
        """Per-question results for the iteration that just finished."""
        from study_buddy.difficulty import normalize

        results = []
        correct = incorrect = unanswered = 0
        for question in self.questions:
            outcome = self.outcome_for(question)
            if outcome is Outcome.CORRECT:
                correct += 1
            elif outcome is Outcome.INCORRECT:
                incorrect += 1
            else:
                unanswered += 1

            results.append(
                {
                    "id": question.get("id", ""),
                    "stem": question.get("stem", ""),
                    "difficulty": normalize(question.get("difficulty")),
                    "outcome": outcome.value,
                    "selected_index": self.answers.get(question.get("id", "")),
                }
            )

        return {
            "iteration": self.iteration,
            "correct": correct,
            "incorrect": incorrect,
            "unanswered": unanswered,
            "total": len(self.questions),
            # Ignored questions are excluded from this test on purpose: a set of
            # ten where the nine answered were all correct is a clean sweep of
            # what the student attempted.
            "all_correct": incorrect == 0,
            "requires_reveal": incorrect > 0,
            "results": results,
        }

    def answers_payload(self) -> list[dict[str, Any]]:
        """Correct answers and explanations, for a student who asked to see them.

        Only genuinely wrong questions appear. A skipped question is ignored by
        the loop, so offering its answer would attach a failure to something the
        student never attempted.
        """
        return [
            {
                "id": question.get("id", ""),
                "stem": question.get("stem", ""),
                "options": question.get("options") or [],
                "correct_index": question.get("correct_index", 0),
                "explanation": question.get("explanation", ""),
            }
            for question in self.questions
            if self.outcome_for(question) is Outcome.INCORRECT
        ]


_SESSIONS: dict[str, StudySession] = {}
_LOCK = asyncio.Lock()


def _sweep(now: float | None = None) -> None:
    """Drop sessions that have been idle past the TTL. Caller holds the lock."""
    cutoff = (now or time.time()) - SESSION_TTL_SECONDS
    for session_id, session in list(_SESSIONS.items()):
        if session.updated_at < cutoff:
            _SESSIONS.pop(session_id, None)


async def get(session_id: str) -> StudySession:
    """Fetch a live session, applying the timer and TTL as a side effect."""
    async with _LOCK:
        _sweep()
        session = _SESSIONS.get(session_id)
        if session is None:
            raise UnknownSession("Unknown or expired study session.")
        # The timer is enforced here rather than trusted to the client, so
        # closing the app cannot buy extra time.
        if session.status == STATUS_ACTIVE and session.timer_expired():
            session.status = STATUS_FINISHED
            session.finished_reason = FINISHED_TIMER
            session.updated_at = time.time()
        return session


async def create(
    *,
    session_id: str,
    user_id: str,
    approved: list[dict[str, Any]],
    concepts: list[dict[str, Any]],
    source_notes: dict[str, Any],
    requested_count: int | None,
    timer_seconds: int | None,
) -> StudySession:
    """Open a session and seed it with the first iteration.

    Iteration one is drawn from the already-validated ingestion bank rather than
    generated fresh, so opening a session costs no model calls beyond ingestion
    itself and every question in it has already cleared the grounding validator.

    An omitted ``requested_count`` means "no preference" and uses the whole bank
    rather than collapsing to a single question; an explicit count is clamped to
    the 1-50 range.
    """
    pool = [q for q in approved if (q.get("options") or []) and q.get("stem")]
    if not pool:
        raise SessionError(
            "Ingestion produced no usable questions. Try different material."
        )

    count = (
        min(len(pool), MAX_QUESTIONS)
        if requested_count is None
        else clamp_question_count(requested_count)
    )
    if len(pool) > count:
        pool = random.sample(pool, count)

    session = StudySession(
        session_id=session_id,
        user_id=user_id,
        concepts=concepts,
        bank=approved,
        source_notes=source_notes,
        question_count=len(pool),
        questions=pool,
        timer_deadline=(time.time() + timer_seconds) if timer_seconds else None,
    )

    async with _LOCK:
        _sweep()
        _SESSIONS[session_id] = session
    return session


async def record_answer(
    session_id: str, question_id: str, selected_index: int | None
) -> dict[str, Any]:
    """Record one answer and report what the client should show next.

    ``selected_index=None`` records an explicit skip. A skipped question is
    ignored rather than counted wrong, per the loop rules.
    """
    async with _LOCK:
        session = _lookup(session_id)

        if session.status == STATUS_FINISHED:
            raise SessionError("This study session has already ended.")
        if session.status == STATUS_AWAITING_REVEAL:
            raise SessionError(
                "This iteration is waiting on the answer-reveal decision."
            )

        question = next(
            (q for q in session.questions if q.get("id") == question_id), None
        )
        if question is None:
            raise SessionError("That question is not part of this iteration.")

        if question_id in session.answers:
            raise SessionError("That question has already been answered.")

        options = question.get("options") or []
        if selected_index is not None and not 0 <= selected_index < len(options):
            raise SessionError("That option index is out of range for this question.")

        session.answers[question_id] = selected_index
        session.updated_at = time.time()

        upcoming = session.next_unanswered()
        if upcoming is not None:
            return {
                "session_id": session.session_id,
                "iteration": session.iteration,
                "status": session.status,
                "question": public_views([upcoming])[0],
                "iteration_complete": False,
            }

        return await _close_iteration(session, reveal_answers=None)


async def submit_reveal(session_id: str, show_answers: bool) -> dict[str, Any]:
    """Record the student's answer-reveal decision and build the next iteration."""
    async with _LOCK:
        session = _lookup(session_id)
        if session.status != STATUS_AWAITING_REVEAL:
            raise SessionError("This iteration is not waiting on that decision.")
        return await _close_iteration(session, reveal_answers=show_answers)


async def finish(session_id: str) -> dict[str, Any]:
    """End a session early at the student's request."""
    async with _LOCK:
        session = _lookup(session_id)
        if session.status != STATUS_FINISHED:
            session.status = STATUS_FINISHED
            session.finished_reason = FINISHED_STUDENT_LEFT
            session.updated_at = time.time()
        return {
            "session_id": session.session_id,
            "iteration": session.iteration,
            "status": session.status,
            "finished_reason": session.finished_reason,
            "seconds_remaining": session.seconds_remaining(),
            "summary": session.summary(),
        }


def _lookup(session_id: str) -> StudySession:
    """Resolve a session, enforcing the timer. Caller holds the lock."""
    _sweep()
    session = _SESSIONS.get(session_id)
    if session is None:
        raise UnknownSession("Unknown or expired study session.")
    if session.status == STATUS_ACTIVE and session.timer_expired():
        session.status = STATUS_FINISHED
        session.finished_reason = FINISHED_TIMER
        session.updated_at = time.time()
    return session


async def _close_iteration(
    session: StudySession, *, reveal_answers: bool | None
) -> dict[str, Any]:
    """Finish an iteration and either pause for the reveal or roll forward.

    This is the only place the loop advances. ``reveal_answers`` is ``None`` on
    the first pass, when we do not yet know whether the student needs to be
    offered the answers.
    """
    summary = session.summary()
    wants_reveal = requires_reveal(session.attempts())

    if wants_reveal and reveal_answers is None:
        session.status = STATUS_AWAITING_REVEAL
        session.updated_at = time.time()
        return {
            "session_id": session.session_id,
            "iteration": session.iteration,
            "status": session.status,
            "question": None,
            "iteration_complete": True,
            "summary": summary,
            "answers": None,
        }

    from study_buddy.study.generation import build_next_iteration

    session.reveal_answers = reveal_answers

    # Captured before ``session.questions`` rolls over: these answers belong to
    # the iteration that just ended, not the one about to start.
    previous_answers = session.answers_payload() if reveal_answers else None

    questions = await build_next_iteration(
        plans=plan_next_iteration(
            session.attempts(), reveal_answers=bool(reveal_answers)
        ),
        questions_by_id={q["id"]: q for q in session.questions if q.get("id")},
        concepts=session.concepts,
        user_id=session.user_id,
    )

    if not questions:
        # Everything was skipped, or nothing needed regenerating and nothing was
        # carried. Opening an empty iteration would strand the student.
        session.status = STATUS_FINISHED
        session.finished_reason = FINISHED_NOTHING_TO_DO
        session.updated_at = time.time()
        return {
            "session_id": session.session_id,
            "iteration": session.iteration,
            "status": session.status,
            "question": None,
            "iteration_complete": True,
"summary": summary,
        "answers": previous_answers,
        "questions": [],
        "finished_reason": session.finished_reason,
    }

    session.questions = questions
    session.answers = {}
    session.iteration += 1
    session.status = STATUS_ACTIVE
    session.reveal_answers = None
    session.updated_at = time.time()

    return {
        "session_id": session.session_id,
        "iteration": session.iteration,
        "status": session.status,
        "question": public_views([questions[0]])[0],
        "questions": public_views(questions),
        "iteration_complete": True,
        "summary": summary,
        "answers": previous_answers,
    }