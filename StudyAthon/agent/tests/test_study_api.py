"""Tests for the study loop's HTTP surface.

Model-free: ingestion and the next-iteration generator are both stubbed, so this
covers the contract the UI team codes against - multipart shape, form fields,
status codes, and above all that a question never leaves the server carrying its
own answer. The loop's behaviour is covered in ``test_study_loop.py`` and
``test_study_session.py``.

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import unittest
from unittest import mock

from fastapi.testclient import TestClient

import server
from study_buddy.ingest.runner import IngestResult
from study_buddy.study import generation, session as session_mod


def _q(qid: str, correct: int = 0, difficulty: str = "medium") -> dict:
    return {
        "id": qid,
        "concept_id": "c1",
        "stem": f"stem for {qid}",
        "options": ["alpha", "beta", "gamma", "delta"],
        "correct_index": correct,
        "explanation": f"the answer to {qid} is alpha because...",
        "evidence_quote": "a quote from the notes",
        "difficulty": difficulty,
    }


_CANNED = IngestResult(
    question_bank={
        "approved": [_q(f"q{i}", correct=i % 4) for i in range(4)],
        "rejected": [],
        "coverage_gaps": [],
    },
    concepts=[{"id": "c1", "topic": "indexes", "statement": "s", "evidence_quote": "q"}],
    source_notes={"title": "Notes", "source_kind": "notes"},
)


async def _fake_ingest(parts, *, user_id="x", learner_profile=None, question_count=None):
    return _CANNED


async def _fake_next(*, plans, questions_by_id, concepts=(), user_id="test"):
    """Stand-in for the model-backed merge, honouring CARRY and DROP.

    Rewritten directives come back visibly different; carried ones come back
    byte-identical, so a test can tell which path the loop took.
    """
    from study_buddy.study.rules import Directive

    out = []
    for plan in plans:
        if plan.directive is Directive.DROP:
            continue
        source = questions_by_id.get(plan.question_id)
        if source is None:
            continue
        if plan.directive is Directive.CARRY:
            out.append(dict(source))
        else:
            out.append(
                {**source, "stem": f"REGENERATED {plan.question_id}"}
            )
    return out


class StudyApiTestCase(unittest.TestCase):
    def setUp(self):
        session_mod._SESSIONS.clear()
        for target, attribute, replacement in (
            (server, "run_ingestion", _fake_ingest),
            (generation, "build_next_iteration", _fake_next),
        ):
            patcher = mock.patch.object(target, attribute, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.client = TestClient(server.app)

    def _open(self, **data):
        payload = {"text": "some study notes about indexes"}
        payload.update(data)
        response = self.client.post("/study/session", data=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()


class TestCreateSession(StudyApiTestCase):
    def test_returns_a_playable_first_iteration(self):
        body = self._open()
        self.assertEqual(body["iteration"], 1)
        self.assertEqual(body["status"], "active")
        self.assertEqual(body["total_questions"], 4)
        self.assertEqual(len(body["questions"]), 4)
        self.assertTrue(body["session_id"])

    def test_questions_carry_no_answers(self):
        # The single most important assertion in this file: a client that can
        # read correct_index or explanation makes the whole loop meaningless.
        body = self._open()
        for question in body["questions"]:
            for leaked in ("correct_index", "explanation", "evidence_quote"):
                self.assertNotIn(leaked, question)
            self.assertEqual(len(question["options"]), 4)

    def test_question_count_form_field_is_honoured(self):
        body = self._open(question_count="2")
        self.assertEqual(len(body["questions"]), 2)

    def test_absurd_question_count_is_clamped_not_rejected(self):
        body = self._open(question_count="5000")
        self.assertLessEqual(len(body["questions"]), 4)

    def test_timer_is_optional_and_reported_back(self):
        self.assertIsNone(self._open()["seconds_remaining"])
        body = self._open(timer_minutes="30")
        self.assertGreater(body["seconds_remaining"], 29 * 60)

    def test_material_is_required(self):
        response = self.client.post("/study/session", data={})
        self.assertEqual(response.status_code, 422)

    def test_files_may_accompany_the_text(self):
        response = self.client.post(
            "/study/session",
            data={"text": "notes", "question_count": "3"},
            files={"files": ("lecture.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
        )
        self.assertEqual(response.status_code, 200, response.text)

    def test_a_corrupt_file_is_rejected_before_any_model_call(self):
        response = self.client.post(
            "/study/session",
            data={"text": "notes"},
            files={"files": ("fake.pdf", b"this is not a pdf", "application/pdf")},
        )
        self.assertEqual(response.status_code, 422)


class TestAnswerEndpoint(StudyApiTestCase):
    def test_answers_advance_through_the_iteration(self):
        session_id = self._open()["session_id"]

        first = self.client.post(
            "/study/answer",
            json={"session_id": session_id, "question_id": "q0", "selected_index": 0},
        ).json()
        self.assertEqual(first["question"]["id"], "q1")
        self.assertFalse(first["iteration_complete"])

        second = self.client.post(
            "/study/answer",
            json={"session_id": session_id, "question_id": "q1", "selected_index": 1},
        ).json()
        self.assertEqual(second["question"]["id"], "q2")

    def test_last_answer_reports_a_summary(self):
        session_id = self._open()["session_id"]
        for i in range(4):
            body = self.client.post(
                "/study/answer",
                json={"session_id": session_id, "question_id": f"q{i}", "selected_index": i % 4},
            ).json()

        self.assertTrue(body["iteration_complete"])
        self.assertTrue(body["summary"]["all_correct"])
        self.assertEqual(body["iteration"], 2)

    def test_a_wrong_answer_asks_for_the_reveal_decision(self):
        session_id = self._open()["session_id"]
        for i in range(4):
            body = self.client.post(
                "/study/answer",
                json={"session_id": session_id, "question_id": f"q{i}", "selected_index": 0},
            ).json()

        self.assertEqual(body["status"], "awaiting_reveal")
        self.assertTrue(body["summary"]["requires_reveal"])
        self.assertIsNone(body["question"])

    def test_skipping_is_accepted_as_null(self):
        session_id = self._open()["session_id"]
        response = self.client.post(
            "/study/answer",
            json={"session_id": session_id, "question_id": "q0", "selected_index": None},
        )
        self.assertEqual(response.status_code, 200, response.text)

    def test_answering_twice_is_a_conflict_not_a_crash(self):
        session_id = self._open()["session_id"]
        payload = {"session_id": session_id, "question_id": "q0", "selected_index": 0}
        self.client.post("/study/answer", json=payload)
        self.assertEqual(self.client.post("/study/answer", json=payload).status_code, 409)

    def test_unknown_session_is_a_404(self):
        response = self.client.post(
            "/study/answer",
            json={"session_id": "nope", "question_id": "q0", "selected_index": 0},
        )
        self.assertEqual(response.status_code, 404)


class TestRevealEndpoint(StudyApiTestCase):
    def _answer_all_wrong(self):
        """Answer every question incorrectly, so a reveal is genuinely required."""
        session_id = self._open()["session_id"]
        for i in range(4):
            self.client.post(
                "/study/answer",
                json={
                    "session_id": session_id,
                    "question_id": f"q{i}",
                    # q0's correct answer is index 0, so a fixed choice would
                    # accidentally get one question right.
                    "selected_index": (i + 1) % 4,
                },
            )
        return session_id

    def test_accepting_returns_answers_then_the_next_iteration(self):
        session_id = self._answer_all_wrong()
        response = self.client.post(
            "/study/reveal", json={"session_id": session_id, "show_answers": True}
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()

        self.assertEqual(len(body["answers"]), 4)
        self.assertIn("correct_index", body["answers"][0])
        self.assertIn("explanation", body["answers"][0])
        self.assertEqual(body["iteration"], 2)
        # The new questions are still stripped of their answers.
        for question in body["questions"]:
            self.assertNotIn("correct_index", question)

    def test_declining_carries_the_questions_unchanged(self):
        session_id = self._answer_all_wrong()
        body = self.client.post(
            "/study/reveal", json={"session_id": session_id, "show_answers": False}
        ).json()

        self.assertIsNone(body["answers"])
        self.assertTrue(all(q["stem"].startswith("stem for") for q in body["questions"]))

    def test_reveal_before_the_iteration_ends_is_a_conflict(self):
        session_id = self._open()["session_id"]
        response = self.client.post(
            "/study/reveal", json={"session_id": session_id, "show_answers": True}
        )
        self.assertEqual(response.status_code, 409)


class TestResumeAndFinish(StudyApiTestCase):
    def test_a_session_can_be_resumed(self):
        session_id = self._open()["session_id"]
        self.client.post(
            "/study/answer",
            json={"session_id": session_id, "question_id": "q0", "selected_index": 0},
        )

        response = self.client.get(f"/study/session/{session_id}")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()

        self.assertEqual(body["status"], "active")
        self.assertEqual(body["iteration"], 1)
        self.assertEqual(len(body["questions"]), 4)
        for question in body["questions"]:
            self.assertNotIn("correct_index", question)

    def test_resuming_an_unknown_session_is_a_404(self):
        self.assertEqual(self.client.get("/study/session/nope").status_code, 404)

    def test_an_expired_timer_ends_the_session_on_resume(self):
        session_id = self._open(timer_minutes="30")["session_id"]
        # Move the deadline into the past; the client never gets a say.
        session_mod._SESSIONS[session_id].timer_deadline = 0

        body = self.client.get(f"/study/session/{session_id}").json()
        self.assertEqual(body["status"], "finished")
        self.assertEqual(body["finished_reason"], "timer_expired")

    def test_an_expired_timer_still_reports_the_recap(self):
        # The timer can fire between two answers, so the iteration never closes
        # normally. Without this the student would lose the explanations for
        # everything they got wrong.
        session_id = self._open(timer_minutes="30")["session_id"]
        self.client.post(
            "/study/answer",
            json={"session_id": session_id, "question_id": "q0", "selected_index": 0},
        )
        self.client.post(
            "/study/answer",
            json={"session_id": session_id, "question_id": "q1", "selected_index": 0},
        )
        session_mod._SESSIONS[session_id].timer_deadline = 0

        body = self.client.get(f"/study/session/{session_id}").json()

        self.assertEqual(body["status"], "finished")
        self.assertIn("summary", body)
        # q0 was answered correctly, q1 was not.
        self.assertEqual(body["summary"]["correct"], 1)
        self.assertEqual(body["summary"]["incorrect"], 1)
        self.assertEqual(len(body["answers"]), 1)
        self.assertIn("explanation", body["answers"][0])
        self.assertIn("correct_index", body["answers"][0])

    def test_an_expired_timer_never_grades_a_skipped_question(self):
        session_id = self._open(timer_minutes="30")["session_id"]
        self.client.post(
            "/study/answer",
            json={"session_id": session_id, "question_id": "q0", "selected_index": None},
        )
        session_mod._SESSIONS[session_id].timer_deadline = 0

        body = self.client.get(f"/study/session/{session_id}").json()

        self.assertEqual(body["summary"]["unanswered"], 4)
        self.assertEqual(body["summary"]["incorrect"], 0)
        self.assertEqual(body["answers"], [])

    def test_answering_past_an_expired_timer_is_refused(self):
        session_id = self._open(timer_minutes="30")["session_id"]
        session_mod._SESSIONS[session_id].timer_deadline = 0

        response = self.client.post(
            "/study/answer",
            json={"session_id": session_id, "question_id": "q0", "selected_index": 0},
        )
        self.assertEqual(response.status_code, 409)

    def test_a_session_can_be_ended_early(self):
        session_id = self._open()["session_id"]
        body = self.client.post("/study/finish", json={"session_id": session_id}).json()

        self.assertEqual(body["status"], "finished")
        self.assertEqual(body["finished_reason"], "student_ended")


class TestOpenApi(StudyApiTestCase):
    def test_the_schema_documents_every_study_route(self):
        schema = server.app.openapi()
        paths = {p for p in schema["paths"] if p.startswith("/study")}
        self.assertEqual(
            paths,
            {
                "/study/session",
                "/study/session/{session_id}",
                "/study/answer",
                "/study/reveal",
                "/study/finish",
            },
        )


if __name__ == "__main__":
    unittest.main()