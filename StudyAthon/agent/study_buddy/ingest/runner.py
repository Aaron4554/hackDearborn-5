"""Runs the ingestion graph and turns its output into something printable.

Shared by the FastAPI endpoint and the command-line harness so both exercise
exactly the same code path.
"""

from __future__ import annotations

import json
import mimetypes
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.adk.agents import LlmAgent

from study_buddy.ingest.common import CONCEPTS, QUESTION_BANK, QUESTIONS, SOURCE_NOTES
from study_buddy.ingest.pipeline import ingest_pipeline
from study_buddy.ingest.validation import grounding_validator
from study_buddy.schemas import QuestionSet
from study_buddy.settings import WRITER_MAX_OUTPUT_TOKENS, resilient_model

APP_NAME = "studyathon_ingest"
REPAIR_APP_NAME = "studyathon_question_repair"

_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}

# Gemini's own MIME types are more reliable than the stdlib for these.
_EXTRA_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".m4a": "audio/mp4",
    ".webm": "video/webm",
}

_session_service = InMemorySessionService()


@dataclass
class IngestResult:
    """Outcome of one ingestion run."""

    question_bank: dict[str, Any] = field(default_factory=dict)
    concepts: list[dict[str, Any]] = field(default_factory=list)
    source_notes: dict[str, Any] = field(default_factory=dict)
    transcript: list[str] = field(default_factory=list)

    @property
    def approved(self) -> list[dict[str, Any]]:
        return self.question_bank.get("approved") or []


def guess_mime_type(filename: str, fallback: str | None = None) -> str:
    """Best-effort MIME type for an uploaded file."""
    for suffix, mime in _EXTRA_MIME_TYPES.items():
        if filename.lower().endswith(suffix):
            return mime
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback or "application/octet-stream"


# Magic-byte prefixes per MIME type. The API answers a malformed upload with a
# bare `400 INVALID_ARGUMENT` for every model, which is indistinguishable from a
# real server error at the endpoint, so it is worth catching on the way in.
_MAGIC_PREFIXES: dict[str, tuple[bytes, ...]] = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
}


def validate_upload(filename: str, data: bytes, mime_type: str) -> None:
    """Reject files whose contents contradict their declared type.

    The API answers a malformed upload with a bare `400 INVALID_ARGUMENT` for
    every model, which is indistinguishable from a real server error at the
    endpoint, so it is worth catching on the way in before any quota is spent.

    The PDF check is deliberately shallow. Parsing a real PDF is out of scope, but
    the header and trailer are cheap to verify and catch the common failure: a
    file that is named ``.pdf`` but is really text, or a truncated download.
    """
    if mime_type == "application/pdf":
        if b"%PDF-" not in data[:1024]:
            _reject(filename, "PDF")
        if b"%%EOF" not in data[-2048:]:
            _reject(filename, "PDF")
        return

    expected = _MAGIC_PREFIXES.get(mime_type)
    if expected and not any(data.startswith(prefix) for prefix in expected):
        _reject(filename, mime_type.split("/", 1)[-1].upper())


def _reject(filename: str, readable: str) -> None:
    raise ValueError(
        f"{filename} does not look like a valid {readable} file. "
        "The file may be corrupt, truncated, or renamed from another format."
    )


def is_youtube_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host in _YOUTUBE_HOSTS or host.endswith(".youtube.com")


def build_parts(
    *,
    text: str | None = None,
    urls: list[str] | None = None,
    files: list[tuple[str, bytes, str | None]] | None = None,
) -> list[types.Part]:
    """Assemble the user message from whichever inputs were supplied.

    ``files`` is a list of ``(filename, data, declared_mime_type)``. Uploaded
    bytes are inlined rather than registered with the Files API: a single study
    session is comfortably under the inline limit, and inlining keeps the request
    to one round trip.
    """
    parts: list[types.Part] = []

    if text and text.strip():
        parts.append(types.Part(text=text.strip()))

    for url in urls or []:
        url = url.strip()
        if not url:
            continue
        if is_youtube_url(url):
            # Gemini resolves public lecture URLs server-side. One per request.
            parts.append(
                types.Part(
                    file_data=types.FileData(file_uri=url, mime_type="video/*")
                )
            )
        else:
            # Not something Gemini will fetch for us; treat it as a pointer only.
            parts.append(
                types.Part(text=f"Reference link supplied by the user: {url}")
            )

    for filename, data, declared in files or []:
        if not data:
            continue
        mime_type = guess_mime_type(filename, declared)
        validate_upload(filename, data, mime_type)
        parts.append(types.Part.from_bytes(data=data, mime_type=mime_type))

    if not parts:
        raise ValueError(
            "Nothing to ingest. Provide note text, a URL, or at least one file."
        )

    return parts


async def run_ingestion(
    parts: list[types.Part],
    *,
    user_id: str = "studyathon-user",
    learner_profile: dict[str, Any] | None = None,
    question_count: int | None = None,
) -> IngestResult:
    """Run the full pipeline over ``parts`` and collect the results."""
    session = await _session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
        state={
            "learner_profile": learner_profile or {"education_level": "other"},
            "question_count": question_count,
        },
    )

    transcript: list[str] = []
    runner = Runner(
        agent=ingest_pipeline,
        app_name=APP_NAME,
        session_service=_session_service,
    )

    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.Content(role="user", parts=parts),
        ):
            text = _event_text(event)
            if text and event.is_final_response():
                transcript.append(f"{event.author}: {text}")

        # State changes land on the session once the invocation finishes.
        final = await _session_service.get_session(
            app_name=APP_NAME, user_id=user_id, session_id=session.id
        )
        state = final.state if final else {}
    finally:
        await _session_service.delete_session(
            app_name=APP_NAME, user_id=user_id, session_id=session.id
        )

    bank = state.get(QUESTION_BANK) or {}
    if not bank:
        detail = "the validator produced no output"
        if transcript:
            detail += f"; last event was {transcript[-1][:400]}"
        raise RuntimeError(f"Ingestion produced no question bank ({detail}).")

    concepts = (state.get(CONCEPTS) or {}).get("concepts") or []
    source_notes = state.get(SOURCE_NOTES) or {}
    approved = bank.get("approved") or []
    if question_count is not None and len(approved) < question_count:
        repaired = await _repair_question_count(
            missing=question_count - len(approved),
            concepts=concepts,
            approved=approved,
            rejected=bank.get("rejected") or [],
            learner_profile=learner_profile or {"education_level": "other"},
            user_id=user_id,
        )
        bank["approved"] = [*approved, *repaired]
        if len(bank["approved"]) < question_count:
            raise QuestionCountError(
                f"The source only supported {len(bank['approved'])} clear questions. "
                "Add more material or choose a smaller question count."
            )

    return IngestResult(
        question_bank=bank,
        concepts=concepts,
        source_notes=source_notes,
        transcript=transcript,
    )


class QuestionCountError(ValueError):
    """The validated source could not support the requested quiz length."""


async def _repair_question_count(
    *,
    missing: int,
    concepts: list[dict[str, Any]],
    approved: list[dict[str, Any]],
    rejected: list[dict[str, Any]],
    learner_profile: dict[str, Any],
    user_id: str,
) -> list[dict[str, Any]]:
    """Generate and validate only the questions missing from the requested set."""
    writer = LlmAgent(
        name="question_count_repair",
        model=resilient_model(),
        description="Fills a shortfall in a grounded study question set.",
        instruction=(
            "Write exactly the requested number of additional multiple-choice "
            "questions. Use only the listed concepts and their verbatim evidence "
            "quotes. Stay within the user's requested topic and learner level. "
            "Do not repeat or paraphrase any existing question. You may test a "
            "different detail or application from the same evidence. Every item "
            "must have exactly four distinct options, a valid correct_index, a "
            "concise explanation, and the matching concept_id/evidence_quote."
        ),
        include_contents="none",
        output_schema=QuestionSet,
        output_key="questions",
        generate_content_config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=WRITER_MAX_OUTPUT_TOKENS,
        ),
    )
    service = InMemorySessionService()
    session = await service.create_session(
        app_name=REPAIR_APP_NAME, user_id=user_id
    )
    payload = json.dumps(
        {
            "additional_question_count": missing,
            "learner_profile": learner_profile,
            "concepts": concepts,
            "already_approved_questions": [
                {"stem": q.get("stem"), "concept_id": q.get("concept_id")}
                for q in approved
            ],
            "rejected_question_ids_and_reasons": rejected,
        },
        ensure_ascii=False,
    )
    runner = Runner(agent=writer, app_name=REPAIR_APP_NAME, session_service=service)
    try:
        async for _ in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=payload)]),
        ):
            pass
        final = await service.get_session(
            app_name=REPAIR_APP_NAME, user_id=user_id, session_id=session.id
        )
        generated = ((final.state if final else {}).get("questions") or {}).get("questions") or []
    finally:
        await service.delete_session(
            app_name=REPAIR_APP_NAME, user_id=user_id, session_id=session.id
        )

    concepts_by_id = {str(c.get("id")): c for c in concepts if c.get("id")}
    existing_stems = {str(q.get("stem", "")).strip().casefold() for q in approved}
    candidates = []
    for index, question in enumerate(generated):
        q = question if isinstance(question, dict) else question.model_dump()
        concept = concepts_by_id.get(str(q.get("concept_id", "")))
        options = q.get("options") or []
        stem = str(q.get("stem", "")).strip()
        evidence = concept.get("evidence_quote", "") if concept else ""
        if (
            not concept
            or not evidence
            or not stem
            or stem.casefold() in existing_stems
            or len(options) != 4
            or len({str(option).strip().casefold() for option in options}) != 4
            or not isinstance(q.get("correct_index"), int)
            or not 0 <= q["correct_index"] < 4
        ):
            continue
        q["id"] = f"repair-{len(approved) + len(candidates) + 1}"
        q["evidence_quote"] = evidence
        candidates.append(q)
        existing_stems.add(stem.casefold())
        if len(candidates) == missing:
            break

    if not candidates:
        return []

    # Run the same grounding gate as the original bank before exposing repairs.
    check_service = InMemorySessionService()
    check_session = await check_service.create_session(
        app_name=REPAIR_APP_NAME,
        user_id=user_id,
        state={
            CONCEPTS: {"concepts": concepts},
            QUESTIONS: {"questions": candidates},
        },
    )
    checker = Runner(
        agent=grounding_validator,
        app_name=REPAIR_APP_NAME,
        session_service=check_service,
    )
    try:
        async for _ in checker.run_async(
            user_id=user_id,
            session_id=check_session.id,
            new_message=types.Content(
                role="user",
                parts=[types.Part(text="Validate these additional questions.")],
            ),
        ):
            pass
        final = await check_service.get_session(
            app_name=REPAIR_APP_NAME,
            user_id=user_id,
            session_id=check_session.id,
        )
        bank = ((final.state if final else {}).get(QUESTION_BANK) or {})
        return bank.get("approved") or []
    finally:
        await check_service.delete_session(
            app_name=REPAIR_APP_NAME,
            user_id=user_id,
            session_id=check_session.id,
        )


def _event_text(event: Any) -> str:
    if not event.content or not event.content.parts:
        return ""
    return "\n".join(p.text for p in event.content.parts if p.text and not p.thought)


def format_report(result: IngestResult) -> str:
    """Render the run as a readable summary. No model call - just formatting."""
    notes = result.source_notes or {}
    bank = result.question_bank or {}
    approved = bank.get("approved") or []
    rejected = bank.get("rejected") or []
    gaps = bank.get("coverage_gaps") or []

    lines = [
        f"Ingested: {notes.get('title') or 'Untitled notes'} "
        f"({notes.get('source_kind', 'notes')})",
        f"Concepts extracted: {len(result.concepts)}",
        f"Questions approved: {len(approved)}",
        f"Questions rejected: {len(rejected)}",
    ]

    if approved:
        lines.append("")
        for question in approved:
            options = question.get("options") or []
            lines.append(f"  [{question.get('difficulty', 'medium')}] {question.get('stem', '')}")
            for index, option in enumerate(options):
                marker = ">" if index == question.get("correct_index") else " "
                lines.append(f"    {marker} {option}")
            if question.get("explanation"):
                lines.append(f"    why: {question['explanation']}")
            lines.append("")

    if rejected:
        lines.append("Rejected:")
        for item in rejected:
            lines.append(f"  - {item.get('question_id', '?')}: {item.get('reason', '')}")
        lines.append("")

    if gaps:
        lines.append("Concepts with no approved question:")
        lines.extend(f"  - {gap}" for gap in gaps)

    return "\n".join(lines).rstrip()


def bank_to_json(result: IngestResult) -> str:
    return json.dumps(result.question_bank, indent=2, ensure_ascii=False)
