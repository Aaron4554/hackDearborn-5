"""Tests for the study loop's session state machine.

Model-free: ``build_next_iteration`` is stubbed, so these cover only the loop's
own behaviour - what the client is told to show next, when the timer fires, and
which questions survive an iteration. The rules themselves are in
``test_study_loop.py`` and the agent in ``iteration.py``.

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import time
import unittest
from unittest import mock

from study_buddy.study import generation, session as session_mod
from study_buddy.study.rules import Directive
from study_buddy.study.session import (
    STATUS_ACTIVE,
    STATUS_AWAITING_REVEAL,
    STATUS_FINISHED,
    FINISHED_TIMER,
    SessionError,
)


def _q(qid: str, difficulty: str = "medium", correct: int = 0) -> dict:
    return {
        "id": qid,
        "concept_id": "c1",
        "stem": f"stem for {qid}",
        "options": ["alpha", "beta", "gamma", "delta"],
        "correct_index": correct,
        "explanation": f"why {qid}",
        "evidence_quote": "source quote",
        "difficulty": difficulty,
    }


def _bank(n: int = 4) -> list[dict]:
    return [_q(f"q{i}", correct=i % 4) for i in range(n)]


async def _fake_next(*, plans, questions_by_id, concepts=(), user_id="test"):
    """Stand-in for the model-backed generator.

    Returns a fresh question for every directive that needs one and replays
    ``CARRY`` verbatim, so the merge behaviour is exercised without quota.
    """
    out = []
    for plan in plans:
        if plan.directive is Directive.DROP:
            continue
        if plan.directive is Directive.CARRY:
            out.append(dict(questions_by_id[plan.question_id]))
            continue
        source = questions_by_id[plan.question_id]
        out.append(
            {
                **source,
                "stem": f"REGENERATED {plan.question_id}",
                "difficulty": plan.difficulty,
            }
        )
    return out


class SessionTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        session_mod._SESSIONS.clear()
        # Patched for every test in this file, not just the ones that remember
        # to. An unpatched generator means a real model call, and a suite that
        # silently spends quota depending on which branch a test happens to
        # exercise is how 20 requests/day disappears.
        patcher = mock.patch.object(
            generation, "build_next_iteration", _fake_next
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    async def _open(
        self,
        bank=None,
        *,
        count=4,
        timer=None,
        session_id="s1",
    ) -> session_mod.StudySession:
        return await session_mod.create(
            session_id=session_id,
            user_id="tester",
            approved=bank if bank is not None else _bank(),
            concepts=[{"id": "c1", "topic": "indexes", "statement": "s"}],
            source_notes={"title": "Notes"},
            requested_count=count,
            timer_seconds=timer,
        )

    async def _answer_all(self, session, *, reveal=None, skip=()):
        """Drive an iteration to completion and return the final response."""
        response = None
        for question in list(session.questions):
            qid = question["id"]
            if qid in skip:
                response = await session_mod.record_answer(session.session_id, qid, None)
            elif reveal is None:
                # Answer correctly so no reveal is needed.
                response = await session_mod.record_answer(
                    session.session_id, qid, question["correct_index"]
                )
            else:
                wrong = (question["correct_index"] + 1) % 4
                response = await session_mod.record_answer(
                    session.session_id, qid, wrong
                )
        return response


class TestCreate(SessionTestCase):
    async def test_seeds_first_iteration_from_the_ingested_bank(self):
        session = await self._open()
        self.assertEqual(session.iteration, 1)
        self.assertEqual(session.status, STATUS_ACTIVE)
        self.assertEqual([q["id"] for q in session.questions], ["q0", "q1", "q2", "q3"])
        self.assertEqual(session.answers, {})

    async def test_question_count_is_clamped_to_the_spec_bounds(self):
        session = await self._open(bank=_bank(4), count=500)
        self.assertEqual(len(session.questions), 4)

    async def test_small_bank_is_used_whole_rather_than_failing(self):
        session = await self._open(bank=_bank(2), count=50)
        self.assertEqual(len(session.questions), 2)

    async def test_empty_bank_raises_a_clear_error(self):
        with self.assertRaises(SessionError):
            await self._open(bank=[])

    async def test_questions_without_options_are_not_asked(self):
        bank = [_q("q0"), {**_q("q1"), "options": []}]
        session = await self._open(bank=bank, count=2)
        self.assertEqual([q["id"] for q in session.questions], ["q0"])

    async def test_timer_deadline_is_recorded(self):
        session = await self._open(timer=600)
        self.assertIsNotNone(session.timer_deadline)
        self.assertGreater(session.seconds_remaining(), 0)


class TestAnswerFlow(SessionTestCase):
    async def test_answering_returns_the_next_question(self):
        session = await self._open()
        response = await session_mod.record_answer(session.session_id, "q0", 0)

        self.assertFalse(response["iteration_complete"])
        self.assertEqual(response["question"]["id"], "q1")
        self.assertEqual(response["status"], STATUS_ACTIVE)

    async def test_questions_are_never_shipped_with_their_answers(self):
        session = await self._open()
        response = await session_mod.record_answer(session.session_id, "q0", 0)

        for leaked in ("correct_index", "explanation", "evidence_quote"):
            self.assertNotIn(leaked, response["question"])

    async def test_answering_twice_is_rejected(self):
        session = await self._open()
        await session_mod.record_answer(session.session_id, "q0", 0)
        with self.assertRaises(SessionError):
            await session_mod.record_answer(session.session_id, "q0", 1)

    async def test_unknown_question_is_rejected(self):
        session = await self._open()
        with self.assertRaises(SessionError):
            await session_mod.record_answer(session.session_id, "nope", 0)

    async def test_out_of_range_option_is_rejected(self):
        session = await self._open()
        with self.assertRaises(SessionError):
            await session_mod.record_answer(session.session_id, "q0", 99)


class TestAllCorrectEscalates(SessionTestCase):
    async def test_clean_sweep_rolls_into_a_harder_iteration(self):
        session = await self._open()
        with mock.patch.object(generation, "build_next_iteration", _fake_next):
            response = await self._answer_all(session)

        self.assertTrue(response["iteration_complete"])
        self.assertEqual(response["iteration"], 2)
        self.assertEqual(response["status"], STATUS_ACTIVE)
        self.assertTrue(response["summary"]["all_correct"])
        self.assertFalse(response["summary"]["requires_reveal"])
        # Every question was rewritten, none carried over unchanged.
        self.assertTrue(
            all(q["stem"].startswith("REGENERATED") for q in response["questions"])
        )

    async def test_escalation_raises_difficulty_and_caps_at_hard(self):
        session = await self._open()
        for question in session.questions:
            question["difficulty"] = "hard"
        with mock.patch.object(generation, "build_next_iteration", _fake_next):
            response = await self._answer_all(session)

        self.assertEqual(
            [q["difficulty"] for q in response["questions"]], ["hard"] * 4
        )

    async def test_no_reveal_step_when_nothing_was_wrong(self):
        session = await self._open()
        response = await self._answer_all(session)
        # Nothing was wrong, so the student was never offered the answers and the
        # loop rolled straight into a harder set.
        self.assertFalse(response["summary"]["requires_reveal"])
        self.assertEqual(response["status"], STATUS_ACTIVE)


class TestRevealBranch(SessionTestCase):
    async def test_a_wrong_answer_pauses_for_the_reveal_decision(self):
        session = await self._open()
        response = await self._answer_all(session, reveal=False)

        self.assertEqual(response["status"], STATUS_AWAITING_REVEAL)
        self.assertTrue(response["summary"]["requires_reveal"])
        self.assertTrue(response["summary"]["requires_reveal"])
        self.assertEqual(response["summary"]["incorrect"], 4)
        self.assertIsNone(response["question"])
        # Nothing is generated until the student has decided.
        self.assertNotIn("questions", response)

    async def test_answering_is_blocked_while_awaiting_the_decision(self):
        session = await self._open()
        await self._answer_all(session, reveal=False)
        with self.assertRaises(SessionError):
            await session_mod.record_answer(session.session_id, "q0", 0)

    async def test_declining_answers_carries_the_questions_verbatim(self):
        session = await self._open()
        await self._answer_all(session, reveal=False)
        before = {q["id"]: q["stem"] for q in session.questions}

        with mock.patch.object(generation, "build_next_iteration", _fake_next):
            response = await session_mod.submit_reveal(session.session_id, False)

        after = {q["id"]: q["stem"] for q in response["questions"]}
        self.assertEqual(before, after)
        self.assertIsNone(response["answers"])

    async def test_accepting_answers_returns_them_and_rewords(self):
        session = await self._open()
        await self._answer_all(session, reveal=False)

        with mock.patch.object(generation, "build_next_iteration", _fake_next):
            response = await session_mod.submit_reveal(session.session_id, True)

        self.assertTrue(all(q["stem"].startswith("REGENERATED") for q in response["questions"]))
        self.assertEqual(len(response["answers"]), 4)
        first = response["answers"][0]
        self.assertIn("correct_index", first)
        self.assertIn("explanation", first)

    async def test_answers_describe_the_iteration_that_just_ended(self):
        # The reveal payload must belong to the outgoing set, not the new one.
        session = await self._open()
        await self._answer_all(session, reveal=False)

        with mock.patch.object(generation, "build_next_iteration", _fake_next):
            response = await session_mod.submit_reveal(session.session_id, True)

        self.assertEqual(response["summary"]["iteration"], 1)
        self.assertEqual(response["iteration"], 2)

    async def test_reveal_requires_the_iteration_to_be_waiting(self):
        session = await self._open()
        with self.assertRaises(SessionError):
            await session_mod.submit_reveal(session.session_id, True)


class TestMixedOutcomes(SessionTestCase):
    async def test_correct_questions_rewrite_while_wrong_ones_carry(self):
        session = await self._open()
        for question in session.questions:
            await session_mod.record_answer(
                session.session_id,
                question["id"],
                question["correct_index"] if question["id"] in ("q0", "q1") else 0,
            )

        with mock.patch.object(generation, "build_next_iteration", _fake_next):
            response = await session_mod.submit_reveal(session.session_id, False)

        stems = {q["id"]: q["stem"] for q in response["questions"]}
        self.assertTrue(stems["q0"].startswith("REGENERATED"))
        self.assertTrue(stems["q1"].startswith("REGENERATED"))
        self.assertFalse(stems["q2"].startswith("REGENERATED"))
        self.assertFalse(stems["q3"].startswith("REGENERATED"))


class TestSkippedQuestionsAreIgnored(SessionTestCase):
    async def _answer_skipping_one(self, session, skipped: str):
        """Answer everything correctly except ``skipped``, which is skipped."""
        response = None
        for question in list(session.questions):
            qid = question["id"]
            if qid == skipped:
                response = await session_mod.record_answer(
                    session.session_id, qid, None
                )
            else:
                response = await session_mod.record_answer(
                    session.session_id, qid, question["correct_index"]
                )
        return response

    async def test_a_skip_does_not_count_as_wrong(self):
        session = await self._open()
        response = await self._answer_skipping_one(session, "q3")

        summary = response["summary"]
        self.assertEqual(summary["unanswered"], 1)
        self.assertEqual(summary["incorrect"], 0)
        self.assertEqual(summary["correct"], 3)
        self.assertTrue(summary["all_correct"])

    async def test_skipped_questions_are_not_carried_forward(self):
        session = await self._open()
        response = await self._answer_skipping_one(session, "q3")

        self.assertNotIn("q3", [q["id"] for q in response["questions"]])
        self.assertEqual([q["id"] for q in response["questions"]], ["q0", "q1", "q2"])

    async def test_a_skip_does_not_trigger_the_reveal_prompt(self):
        session = await self._open()
        response = await self._answer_skipping_one(session, "q3")

        # Ignored is not wrong, so a clean sweep of what was attempted escalates.
        self.assertFalse(response["summary"]["requires_reveal"])
        self.assertEqual(response["status"], STATUS_ACTIVE)

    async def test_explanations_are_not_offered_for_a_skipped_question(self):
        session = await self._open()
        # Two right, one skipped, one wrong: the wrong answer is what triggers
        # the offer, and only it should appear in it.
        for question in list(session.questions):
            qid = question["id"]
            if qid == "q2":
                choice = None
            elif qid == "q3":
                choice = (question["correct_index"] + 1) % 4
            else:
                choice = question["correct_index"]
            await session_mod.record_answer(session.session_id, qid, choice)

        response = await session_mod.submit_reveal(session.session_id, True)
        offered = [a["id"] for a in response["answers"]]

        self.assertEqual(offered, ["q3"])

    async def test_skipping_everything_ends_the_session(self):
        session = await self._open()
        # Ignored questions are not wrong, so no reveal is offered and the loop
        # closes on the final answer with nothing left to ask.
        response = await self._answer_all(session, skip=("q0", "q1", "q2", "q3"))

        self.assertEqual(response["status"], STATUS_FINISHED)
        self.assertEqual(response["questions"], [])
        self.assertEqual(response["finished_reason"], "no_questions_left")
        self.assertEqual(response["summary"]["unanswered"], 4)


class TestTimer(SessionTestCase):
    async def test_expired_timer_ends_the_session(self):
        session = await self._open(timer=600)
        session.timer_deadline = time.time() - 1

        with self.assertRaises(SessionError):
            await session_mod.record_answer(session.session_id, "q0", 0)

        ended = await session_mod.get(session.session_id)
        self.assertEqual(ended.status, STATUS_FINISHED)
        self.assertEqual(ended.finished_reason, FINISHED_TIMER)

    async def test_timer_is_enforced_by_the_server_not_the_client(self):
        # The deadline is stored server-side, so a client that ignores the
        # countdown still cannot answer past it.
        session = await self._open(timer=600)
        session.timer_deadline = time.time() - 1
        await session_mod.get(session.session_id)

        with self.assertRaises(SessionError):
            await session_mod.record_answer(session.session_id, "q0", 0)

    async def test_no_timer_means_no_expiry(self):
        session = await self._open(timer=None)
        self.assertFalse(session.timer_expired())
        self.assertIsNone(session.seconds_remaining())

    async def test_student_can_end_the_session_early(self):
        session = await self._open()
        response = await session_mod.finish(session.session_id)
        self.assertEqual(response["status"], STATUS_FINISHED)
        self.assertEqual(response["finished_reason"], "student_ended")


class TestUnknownSession(SessionTestCase):
    async def test_unknown_session_raises(self):
        with self.assertRaises(SessionError):
            await session_mod.get("does-not-exist")


if __name__ == "__main__":
    unittest.main()