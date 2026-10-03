"""Tests for the ingestion pipeline's pure logic.

Deliberately model-free: these cover the parts that are wrong in ways a live run
would blame on the model - MIME guessing, YouTube detection, state JSON
rendering, schema leniency - so a failure here points at our code, not Gemini.

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace

from google.genai import types

from study_buddy.ingest.common import state_json
from study_buddy.ingest.runner import (
    IngestResult,
    build_parts,
    format_report,
    guess_mime_type,
    is_youtube_url,
)
from study_buddy.schemas import (
    Concept,
    ConceptSet,
    Question,
    QuestionBank,
    QuestionSet,
    SourceNotes,
)


def _ctx(state: dict) -> SimpleNamespace:
    return SimpleNamespace(state=state)


class TestGuessMimeType(unittest.TestCase):
    def test_pdf_override_beats_stdlib(self) -> None:
        self.assertEqual(guess_mime_type("lecture.pdf"), "application/pdf")

    def test_case_insensitive(self) -> None:
        self.assertEqual(guess_mime_type("SLIDES.PDF"), "application/pdf")

    def test_known_stdlib_type(self) -> None:
        self.assertEqual(guess_mime_type("board.png"), "image/png")

    def test_declared_type_is_the_fallback(self) -> None:
        self.assertEqual(guess_mime_type("scan", "image/webp"), "image/webp")

    def test_final_fallback_is_octet_stream(self) -> None:
        self.assertEqual(guess_mime_type("mystery"), "application/octet-stream")


class TestIsYoutubeUrl(unittest.TestCase):
    def test_common_hosts(self) -> None:
        for url in (
            "https://youtube.com/watch?v=abc",
            "https://www.youtube.com/watch?v=abc",
            "https://youtu.be/abc",
            "https://m.youtube.com/watch?v=abc",
        ):
            self.assertTrue(is_youtube_url(url), url)

    def test_lookalike_host_is_not_youtube(self) -> None:
        self.assertFalse(is_youtube_url("https://notyoutube.com/watch?v=abc"))

    def test_non_url_is_rejected(self) -> None:
        self.assertFalse(is_youtube_url("just some text"))
        self.assertFalse(is_youtube_url("https://example.com/video.mp4"))


class TestBuildParts(unittest.TestCase):
    def test_requires_some_input(self) -> None:
        with self.assertRaises(ValueError):
            build_parts()
        with self.assertRaises(ValueError):
            build_parts(text="   \n  ")

    def test_text_is_trimmed(self) -> None:
        parts = build_parts(text="  notes here  \n")
        self.assertEqual(len(parts), 1)
        self.assertEqual(parts[0].text, "notes here")

    def test_youtube_url_becomes_file_data(self) -> None:
        parts = build_parts(urls=["https://youtu.be/abc"])
        self.assertEqual(parts[0].file_data.file_uri, "https://youtu.be/abc")
        self.assertEqual(parts[0].file_data.mime_type, "video/*")

    def test_other_url_becomes_reference_text(self) -> None:
        parts = build_parts(urls=["https://example.com/notes"])
        self.assertIn("https://example.com/notes", parts[0].text)
        self.assertIsNone(parts[0].file_data)

    def test_files_are_inlined_with_guessed_mime(self) -> None:
        parts = build_parts(files=[("lecture.pdf", b"%PDF-1.4\ntrailer\n%%EOF\n", None)])
        self.assertEqual(parts[0].inline_data.mime_type, "application/pdf")
        self.assertTrue(parts[0].inline_data.data.startswith(b"%PDF-1.4"))

    def test_empty_file_bytes_are_skipped(self) -> None:
        with self.assertRaises(ValueError):
            build_parts(files=[("blank.pdf", b"", None)])
        parts = build_parts(text="notes", files=[("blank.pdf", b"", None)])
        self.assertEqual(len(parts), 1)

    def test_mixed_inputs_preserve_order(self) -> None:
        parts = build_parts(
            text="typed notes",
            urls=["https://youtu.be/abc"],
            files=[("board.png", b"\x89PNG\r\n\x1a\ndata", None)],
        )
        self.assertEqual(len(parts), 3)
        self.assertTrue(parts[0].text)
        self.assertTrue(parts[1].file_data)
        self.assertTrue(parts[2].inline_data)

    def test_blank_urls_are_skipped(self) -> None:
        parts = build_parts(text="notes", urls=["", "  "])
        self.assertEqual(len(parts), 1)


class TestStateJson(unittest.TestCase):
    def test_renders_real_json_not_python_repr(self) -> None:
        """Python repr would emit single quotes and True; the model needs JSON."""
        rendered = state_json(_ctx({"concepts": {"concepts": [{"id": "c01", "ok": True}]}}), "concepts")
        self.assertEqual(json.loads(rendered), {"concepts": [{"id": "c01", "ok": True}]})
        self.assertIn('"ok": true', rendered)

    def test_missing_key_uses_fallback(self) -> None:
        rendered = state_json(_ctx({}), "concepts", {"concepts": []})
        self.assertEqual(json.loads(rendered), {"concepts": []})

    def test_missing_key_without_fallback_is_null(self) -> None:
        self.assertEqual(json.loads(state_json(_ctx({}), "concepts")), None)

    def test_non_ascii_is_preserved(self) -> None:
        rendered = state_json(_ctx({"notes": {"title": "Zellteilung"}}), "notes")
        self.assertIn("Zellteilung", rendered)


class TestSchemas(unittest.TestCase):
    def test_empty_model_response_still_validates(self) -> None:
        """A blank response must not abort the run."""
        self.assertEqual(SourceNotes().sections, [])
        self.assertEqual(ConceptSet().concepts, [])
        self.assertEqual(QuestionSet().questions, [])
        self.assertEqual(QuestionBank().approved, [])

    def test_question_does_not_constrain_option_count(self) -> None:
        """A bad option count must reach the validator, not raise here."""
        question = Question(stem="s", options=["only one"], correct_index=5)
        self.assertEqual(question.options, ["only one"])

    def test_question_round_trips(self) -> None:
        payload = {
            "id": "q01",
            "concept_id": "c01",
            "stem": "Which stage aligns chromosomes at the metaphase plate?",
            "options": ["prophase", "metaphase", "anaphase", "telophase"],
            "correct_index": 1,
            "explanation": "Chromosomes align at the equator in metaphase.",
            "evidence_quote": "In metaphase, chromosomes align along the equator",
            "difficulty": "easy",
        }
        question = Question(**payload)
        self.assertEqual(question.model_dump(exclude_none=True), payload)

    def test_unknown_fields_are_ignored(self) -> None:
        """Model-invented extras must not break validation."""
        concept = Concept(topic="Mitosis", confidence="high")
        self.assertEqual(concept.topic, "Mitosis")
        self.assertNotIn("confidence", concept.model_dump())


class TestFormatReport(unittest.TestCase):
    def _result(self) -> IngestResult:
        return IngestResult(
            source_notes={"title": "Cell Biology", "source_kind": "slides"},
            concepts=[{"id": "c01"}],
            question_bank={
                "approved": [
                    {
                        "id": "q01",
                        "stem": "Which stage separates chromatids?",
                        "options": ["prophase", "anaphase"],
                        "correct_index": 1,
                        "difficulty": "easy",
                        "explanation": "Anaphase pulls chromatids apart.",
                    }
                ],
                "rejected": [{"question_id": "q02", "reason": "ambiguous options"}],
                "coverage_gaps": ["cytokinesis"],
            },
        )

    def test_marks_the_correct_option(self) -> None:
        report = format_report(self._result())
        self.assertIn("> anaphase", report)
        self.assertIn("  prophase", report)

    def test_summarises_counts_and_rejections(self) -> None:
        report = format_report(self._result())
        self.assertIn("Concepts extracted: 1", report)
        self.assertIn("Questions approved: 1", report)
        self.assertIn("Questions rejected: 1", report)
        self.assertIn("ambiguous options", report)
        self.assertIn("cytokinesis", report)

    def test_handles_a_run_with_no_approved_questions(self) -> None:
        empty = IngestResult(question_bank={"approved": [], "rejected": [], "coverage_gaps": []})
        report = format_report(empty)
        self.assertIn("Questions approved: 0", report)
        self.assertNotIn("Rejected:", report)


class TestPipelineGraph(unittest.TestCase):
    def test_stage_order_and_handoff(self) -> None:
        from study_buddy.ingest import ingest_pipeline

        self.assertEqual(
            [a.name for a in ingest_pipeline.sub_agents],
            [
                "source_normalizer",
                "concept_extractor",
                "question_writer",
                "grounding_validator",
            ],
        )

    def test_only_the_first_stage_sees_raw_input(self) -> None:
        """The PDF must not be re-sent to stages 2-4."""
        from study_buddy.ingest import ingest_pipeline

        contents = {a.name: a.include_contents for a in ingest_pipeline.sub_agents}
        self.assertEqual(contents["source_normalizer"], "default")
        for name in ("concept_extractor", "question_writer", "grounding_validator"):
            self.assertEqual(contents[name], "none", name)

    def test_every_stage_writes_state(self) -> None:
        from study_buddy.ingest import ingest_pipeline

        for stage in ingest_pipeline.sub_agents:
            self.assertIsNotNone(stage.output_key, stage.name)
            self.assertIsNotNone(stage.output_schema, stage.name)

    def test_input_parts_are_preserved_without_artifacts(self) -> None:
        """Default RunConfig must keep inline bytes visible to the model."""
        from google.adk.agents.run_config import RunConfig

        self.assertFalse(RunConfig().save_input_blobs_as_artifacts)

    def test_part_types_used_by_build_parts_are_valid(self) -> None:
        parts = build_parts(
            text="t", urls=["https://youtu.be/a"], files=[("a.pdf", b"%PDF-1.4\ntrailer\n%%EOF\n", None)]
        )
        for part in parts:
            self.assertIsInstance(part, types.Part)


class TestResilientModel(unittest.TestCase):
    """The retry/fallback policy, exercised without touching the network."""

    @staticmethod
    def _err(cls, code: int, message: str = "") -> Exception:
        return cls(code, {"error": {"message": message}}, None)

    def test_capacity_errors_retry_the_same_model(self) -> None:
        from google.genai import errors

        from study_buddy.resilient import classify

        for code in (429, 500, 502, 503, 504):
            self.assertEqual(classify(self._err(errors.ServerError, code)), "retry", code)

    def test_bad_key_is_fatal(self) -> None:
        from google.genai import errors

        from study_buddy.resilient import classify

        for code in (401, 403):
            self.assertEqual(classify(self._err(errors.ClientError, code)), "fatal", code)

    def test_missing_or_invalid_model_moves_to_the_next_candidate(self) -> None:
        from google.genai import errors

        from study_buddy.resilient import classify

        for code in (400, 404, 422):
            self.assertEqual(classify(self._err(errors.ClientError, code)), "next", code)

    def test_unknown_errors_are_retried(self) -> None:
        from study_buddy.resilient import classify

        self.assertEqual(classify(TimeoutError("timed out")), "retry")


class TestQuotaAwareClassification(unittest.TestCase):
    """The free tier caps requests per day, so a 429 often means 'come back tomorrow'."""

    @staticmethod
    def _exhausted(retry_delay: str) -> Exception:
        from google.genai import errors

        payload = {
            "error": {
                "code": 429,
                "message": "Quota exceeded",
                "status": "RESOURCE_EXHAUSTED",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.RetryInfo",
                        "retryDelay": retry_delay,
                    }
                ],
            }
        }
        return errors.ClientError(429, payload, None)

    def test_multi_hour_quota_wait_skips_to_another_model(self) -> None:
        from study_buddy.resilient import classify

        # Observed live: "Please retry in 4h35m31s" on the free tier.
        self.assertEqual(classify(self._exhausted("16531s")), "next")

    def test_burst_limit_wait_is_retried(self) -> None:
        from study_buddy.resilient import classify

        self.assertEqual(classify(self._exhausted("20s")), "retry")

    def test_parses_retry_delay(self) -> None:
        from study_buddy.resilient import retry_after_seconds

        self.assertEqual(retry_after_seconds(self._exhausted("16531s")), 16531.0)
        self.assertEqual(retry_after_seconds(self._exhausted("1.5s")), 1.5)

    def test_plain_429_without_retry_info_still_retries(self) -> None:
        from google.genai import errors

        from study_buddy.resilient import classify, retry_after_seconds

        exc = errors.ClientError(429, {"error": {"message": "slow down"}}, None)
        self.assertIsNone(retry_after_seconds(exc))
        self.assertEqual(classify(exc), "retry")

    def test_error_message_names_the_quota_reset(self) -> None:
        """A bare 'try again later' hides the real problem on the free tier."""
        import asyncio

        from google.adk.models.llm_request import LlmRequest
        from google.genai import types

        from study_buddy.resilient import ResilientGemini

        request = LlmRequest(
            model="nominal",
            contents=[types.Content(role="user", parts=[types.Part(text="hi")])],
        )

        class AlwaysExhausted:
            def __init__(self, model: str) -> None:
                self.model = model

            async def generate_content_async(self, req, stream=False):
                from google.genai import errors

                yield object()
                raise errors.ClientError(
                    429,
                    {
                        "error": {
                            "details": [
                                {
                                    "@type": "type.googleapis.com/google.rpc.RetryInfo",
                                    "retryDelay": "14400s",
                                }
                            ]
                        }
                    },
                    None,
                )
                yield  # pragma: no cover

        async def run() -> str:
            import study_buddy.resilient as resilient_mod

            wrapper = ResilientGemini(
                candidates=["a", "b"], attempts_per_model=1, base_delay=0.0
            )
            prev = resilient_mod.Gemini
            resilient_mod.Gemini = AlwaysExhausted
            try:
                async for _ in wrapper.generate_content_async(request):
                    pass
            except RuntimeError as exc:
                return str(exc)
            finally:
                resilient_mod.Gemini = prev
            return ""

        message = asyncio.run(run())
        self.assertIn("free-tier quota exhausted", message)
        self.assertIn("4.0h", message)

    def test_candidates_are_deduplicated_in_order(self) -> None:
        from study_buddy.settings import MODEL, resilient_model

        candidates = resilient_model([MODEL, "gemini-3.5-flash", MODEL]).candidates
        self.assertEqual(candidates, [MODEL, "gemini-3.5-flash"])

    def test_default_chain_starts_with_the_configured_model(self) -> None:
        from study_buddy.settings import MODEL, resilient_model

        self.assertEqual(resilient_model().candidates[0], MODEL)

    def test_every_stage_uses_the_resilient_wrapper(self) -> None:
        from study_buddy.ingest import ingest_pipeline
        from study_buddy.resilient import ResilientGemini

        for stage in ingest_pipeline.sub_agents:
            self.assertIsInstance(stage.model, ResilientGemini, stage.name)

    def test_retries_send_an_unmutated_request(self) -> None:
        """Gemini rewrites parts in place; a retry must not resend mutated content."""
        import asyncio

        from google.adk.models.llm_request import LlmRequest
        from google.genai import types

        from study_buddy.resilient import ResilientGemini

        request = LlmRequest(
            model="nominal",
            contents=[types.Content(role="user", parts=[types.Part(text="hello")])],
        )
        seen: list[str] = []

        class FakeGemini:
            def __init__(self, model: str) -> None:
                self.model = model

            async def generate_content_async(self, req, stream=False):
                seen.append(req.model)
                # Simulate Gemini's in-place mutation.
                req.contents[0].parts[0].text += " MUTATED"
                yield object()
                raise TimeoutError("flaky")

        async def run() -> str:
            import study_buddy.resilient as resilient_mod

            wrapper = ResilientGemini(
                candidates=["only-model"], attempts_per_model=2, base_delay=0.0
            )
            prev = resilient_mod.Gemini
            resilient_mod.Gemini = FakeGemini
            try:
                async for _ in wrapper.generate_content_async(request):
                    pass
            except Exception as exc:  # expected: retries exhausted
                return type(exc).__name__
            finally:
                resilient_mod.Gemini = prev
            return "no-error"

        outcome = asyncio.run(run())
        self.assertEqual(seen, ["only-model", "only-model"])
        self.assertEqual(outcome, "RuntimeError")
        # The caller's request must be untouched by either attempt.
        self.assertEqual(request.contents[0].parts[0].text, "hello")


class TestUploadValidation(unittest.TestCase):
    """A corrupt upload answers 400 on every model; catch it before spending quota."""

    def test_valid_pdf_passes(self) -> None:
        from study_buddy.ingest.runner import validate_upload

        validate_upload(
            "lecture.pdf", b"%PDF-1.4\nobj\ntrailer\n%%EOF\n", "application/pdf"
        )

    def test_pdf_with_leading_preamble_passes(self) -> None:
        from study_buddy.ingest.runner import validate_upload

        validate_upload(
            "lecture.pdf", b"\x00\x00 junk%PDF-1.4\ntrailer\n%%EOF\n", "application/pdf"
        )

    def test_fake_pdf_is_rejected(self) -> None:
        from study_buddy.ingest.runner import validate_upload

        with self.assertRaises(ValueError) as ctx:
            validate_upload("lecture.pdf", b"just some text", "application/pdf")
        self.assertIn("does not look like a valid PDF", str(ctx.exception))

    def test_truncated_pdf_without_trailer_is_rejected(self) -> None:
        """A file with a %PDF header but no %%EOF is a broken download."""
        from study_buddy.ingest.runner import validate_upload

        with self.assertRaises(ValueError):
            validate_upload("lecture.pdf", b"%PDF-1.4\nhalf a file", "application/pdf")

    def test_png_magic_is_checked(self) -> None:
        from study_buddy.ingest.runner import validate_upload

        validate_upload("board.png", b"\x89PNG\r\n\x1a\ndata", "image/png")
        with self.assertRaises(ValueError):
            validate_upload("board.png", b"\xff\xd8\xffjpeg", "image/png")

    def test_text_and_unknown_types_are_not_sniffed(self) -> None:
        from study_buddy.ingest.runner import validate_upload

        validate_upload("notes.txt", b"anything", "text/plain")
        validate_upload("data.bin", b"\x00\x01", "application/octet-stream")

    def test_build_parts_rejects_a_corrupt_upload(self) -> None:
        with self.assertRaises(ValueError) as ctx:
            build_parts(files=[("lecture.pdf", b"not a pdf", None)])
        self.assertIn("lecture.pdf", str(ctx.exception))

    def test_build_parts_accepts_a_valid_upload(self) -> None:
        parts = build_parts(files=[("lecture.pdf", b"%PDF-1.4\ntrailer\n%%EOF\n", None)])
        self.assertEqual(parts[0].inline_data.mime_type, "application/pdf")


class TestInvalidRequestSurfacesAsClientError(unittest.TestCase):
    @staticmethod
    def _request() -> object:
        from google.adk.models.llm_request import LlmRequest
        from google.genai import types

        return LlmRequest(
            model="nominal",
            contents=[types.Content(role="user", parts=[types.Part(text="hi")])],
        )

    @staticmethod
    def _drive(wrapper, error_cls, code: int, payload: dict) -> str:
        import asyncio

        from google.genai import errors

        class Always:
            def __init__(self, model: str) -> None:
                self.model = model

            async def generate_content_async(self, req, stream=False):
                yield object()
                raise error_cls(code, payload, None)
                yield  # pragma: no cover

        async def run() -> str:
            import study_buddy.resilient as resilient_mod

            prev = resilient_mod.Gemini
            resilient_mod.Gemini = Always
            try:
                async for _ in wrapper.generate_content_async(TestInvalidRequestSurfacesAsClientError._request()):
                    pass
            except BaseException as exc:  # noqa: BLE001 - we assert the type
                return type(exc).__name__
            finally:
                resilient_mod.Gemini = prev
            return "no-error"

        _ = errors  # imported for clarity
        return asyncio.run(run())

    def test_all_models_400_raises_invalid_request_error(self) -> None:
        from google.genai import errors

        from study_buddy.resilient import ResilientGemini

        wrapper = ResilientGemini(candidates=["a", "b"], attempts_per_model=1, base_delay=0.0)
        outcome = self._drive(
            wrapper, errors.ClientError, 400, {"error": {"message": "invalid argument"}}
        )
        self.assertEqual(outcome, "InvalidRequestError")

    def test_quota_failure_is_not_reported_as_invalid_input(self) -> None:
        from google.genai import errors

        from study_buddy.resilient import ResilientGemini

        wrapper = ResilientGemini(candidates=["a"], attempts_per_model=1, base_delay=0.0)
        outcome = self._drive(
            wrapper,
            errors.ClientError,
            429,
            {
                "error": {
                    "details": [
                        {
                            "@type": "type.googleapis.com/google.rpc.RetryInfo",
                            "retryDelay": "16000s",
                        }
                    ]
                }
            },
        )
        self.assertEqual(outcome, "RuntimeError")


if __name__ == "__main__":
    unittest.main()