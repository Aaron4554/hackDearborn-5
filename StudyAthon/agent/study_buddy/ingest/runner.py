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

from study_buddy.ingest.common import CONCEPTS, QUESTION_BANK, SOURCE_NOTES
from study_buddy.ingest.pipeline import ingest_pipeline

APP_NAME = "studyathon_ingest"

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
        parts.append(
            types.Part.from_bytes(
                data=data, mime_type=guess_mime_type(filename, declared)
            )
        )

    if not parts:
        raise ValueError(
            "Nothing to ingest. Provide note text, a URL, or at least one file."
        )

    return parts


async def run_ingestion(
    parts: list[types.Part],
    *,
    user_id: str = "studyathon-user",
) -> IngestResult:
    """Run the full pipeline over ``parts`` and collect the results."""
    session = await _session_service.create_session(
        app_name=APP_NAME, user_id=user_id
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

    return IngestResult(
        question_bank=bank,
        concepts=(state.get(CONCEPTS) or {}).get("concepts") or [],
        source_notes=state.get(SOURCE_NOTES) or {},
        transcript=transcript,
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