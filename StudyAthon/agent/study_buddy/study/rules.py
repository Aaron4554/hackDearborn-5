"""Pure transition rules for the study loop.

Everything the loop decides lives here, with no model calls and no I/O, so the
rules can be tested exhaustively without spending quota. ``iteration.py`` turns
the directives produced here into model calls; ``session.py`` owns the state.
If a rule is wrong, it is wrong in this file.

The loop, per the product spec, runs one *iteration* over the questions and
then decides what the next one looks like:

* every answered question correct -> a new, harder set;
* otherwise each question is handled according to how it went, and the student
  is offered the answers before the next iteration is built.

A question the student never answered is **ignored**. It is not wrong, so it
does not drag the set toward the mixed branch, it does not get an explanation
offered for it, and it does not come back next iteration. Treating a skipped
question as a failure would punish a student whose timer expired mid-set.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable, Mapping, Sequence

from study_buddy.difficulty import bump, normalize
from study_buddy.settings import MAX_QUESTIONS, MIN_QUESTIONS


class Outcome(str, Enum):
    """How one question went in the iteration that just finished."""

    CORRECT = "correct"
    INCORRECT = "incorrect"
    UNANSWERED = "unanswered"


class Directive(str, Enum):
    """What to do with one question when building the next iteration."""

    #: Answered correctly: a different question on the same idea, same difficulty.
    REWRITE = "rewrite"
    #: Answered wrong and the student read the answer: same idea, reworded.
    REWORD = "reword"
    #: Answered wrong and the student declined the answer: ask it again unchanged.
    CARRY = "carry"
    #: Whole set was correct: a new question, one tier harder.
    HARDER = "harder"
    #: Never answered. Contributes nothing and is not carried forward.
    DROP = "drop"

    @property
    def needs_generation(self) -> bool:
        """Whether fulfilling this directive costs a model call.

        ``CARRY`` re-asks the identical question and ``DROP`` emits nothing, so
        neither should reach the writer. Keeping a student who declined every
        answer on a free loop matters when quota is 20 requests per model per day.
        """
        return self not in (Directive.CARRY, Directive.DROP)


@dataclass(frozen=True)
class Attempt:
    """One question's outcome within a finished iteration."""

    question_id: str
    difficulty: str = "medium"
    outcome: Outcome = Outcome.UNANSWERED


@dataclass(frozen=True)
class QuestionPlan:
    """A directive for one question, ready to be turned into a model call."""

    question_id: str
    difficulty: str
    directive: Directive
    outcome: Outcome

    @property
    def needs_generation(self) -> bool:
        """See ``Directive.needs_generation``."""
        return self.directive.needs_generation


def requires_reveal(attempts: Iterable[Attempt]) -> bool:
    """Whether the student must be offered the answers before the loop continues.

    Driven purely by *incorrect* answers. Unanswered questions are ignored, so a
    timer that expires with everything still-correct does not raise this.
    """
    return any(attempt.outcome is Outcome.INCORRECT for attempt in attempts)


def should_escalate(attempts: Sequence[Attempt]) -> bool:
    """Whether the whole iteration was answered correctly.

    Ignored (unanswered) questions do not count against the student: a set of
    ten where the nine answered were all correct is a clean sweep of what the
    student attempted, and escalating is the right response to that.
    """
    return not requires_reveal(attempts)


def plan_next_iteration(
    attempts: Sequence[Attempt],
    *,
    reveal_answers: bool,
) -> list[QuestionPlan]:
    """Decide what each question becomes in the next iteration.

    ``reveal_answers`` is the single end-of-iteration answer the student gave
    when offered the explanations. It only decides the fate of questions they
    got wrong: having read the answer, the question is reworded so they meet the
    idea again in a new shape; having declined it, they are asked the identical
    question again.

    Returns one plan per question, including ``DROP`` entries, so callers can
    report what happened to every question. An empty result means nothing is
    worth carrying forward and the loop should end rather than start another
    iteration.
    """
    if should_escalate(attempts):
        return [
            QuestionPlan(
                question_id=attempt.question_id,
                difficulty=bump(attempt.difficulty),
                directive=Directive.HARDER,
                outcome=attempt.outcome,
            )
            for attempt in attempts
            if attempt.outcome is not Outcome.UNANSWERED
        ]

    plans: list[QuestionPlan] = []
    for attempt in attempts:
        if attempt.outcome is Outcome.UNANSWERED:
            directive = Directive.DROP
        elif attempt.outcome is Outcome.CORRECT:
            directive = Directive.REWRITE
        elif reveal_answers:
            directive = Directive.REWORD
        else:
            directive = Directive.CARRY

        plans.append(
            QuestionPlan(
                question_id=attempt.question_id,
                difficulty=normalize(attempt.difficulty),
                directive=directive,
                outcome=attempt.outcome,
            )
        )
    return plans


def clamp_question_count(requested: int | None) -> int:
    """Hold a requested question count inside the supported 1-50 range.

    The spec's bounds are inclusive and hard. Clamping rather than rejecting
    keeps a client that sends ``0`` or ``999`` working, which is friendlier than
    a 422 over a slider that was never going to produce those values anyway.
    """
    if requested is None:
        return MIN_QUESTIONS
    return max(MIN_QUESTIONS, min(int(requested), MAX_QUESTIONS))


# Fields that would give the answer away. Anything listed here must never reach
# a client that is meant to answer the question.
_ANSWER_KEYS = ("correct_index", "explanation", "evidence_quote")


def public_view(question: Mapping[str, Any]) -> dict[str, Any]:
    """Strip answer-bearing fields from a question bound for a student.

    This is the only sanctioned path for sending a question out. ``correct_index``
    is the score itself and ``explanation`` states it in words; shipping either
    makes the app trivially cheatable and makes the study loop meaningless.
    ``evidence_quote`` comes straight from the student's notes and would let the
    client display the source without a second round trip, but it frequently
    paraphrases the answer, so it stays server-side too.
    """
    return {k: v for k, v in question.items() if k not in _ANSWER_KEYS}


def public_views(questions: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """``public_view`` over a batch of questions."""
    return [public_view(question) for question in questions]