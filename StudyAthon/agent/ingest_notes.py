#!/usr/bin/env python
"""Command-line harness for the ingestion agents.

Runs the same pipeline the HTTP endpoint uses, so you can iterate on prompts
without starting a server or building a mobile request.

    python ingest_notes.py notes.txt
    python ingest_notes.py --url https://youtube.com/watch?v=...
    python ingest_notes.py --pdf lecture.pdf --json
"""

from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from study_buddy.ingest.runner import (  # noqa: E402  (after load_dotenv)
    IngestResult,
    bank_to_json,
    build_parts,
    format_report,
    run_ingestion,
)

DEFAULT_TEXT_FILES = {".txt", ".md", ".text", ".rst"}


def collect_files(paths: list[str]) -> tuple[str, list[tuple[str, bytes, str | None]]]:
    """Read uploads from disk, routing plain-text files into the text part."""
    text_chunks: list[str] = []
    uploads: list[tuple[str, bytes, str | None]] = []

    for raw in paths:
        path = Path(raw).expanduser()
        if not path.is_file():
            raise SystemExit(f"Not a file: {path}")
        if path.suffix.lower() in DEFAULT_TEXT_FILES:
            text_chunks.append(path.read_text(encoding="utf-8", errors="replace"))
        else:
            uploads.append((path.name, path.read_bytes(), None))

    return "\n\n".join(text_chunks), uploads


async def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest study notes into MCQs.")
    parser.add_argument("files", nargs="*", help="Notes, PDFs, or images to ingest.")
    parser.add_argument("--url", action="append", default=[], help="YouTube URL.")
    parser.add_argument("--text", help="Raw note text.")
    parser.add_argument("--json", action="store_true", help="Emit the raw question bank.")
    args = parser.parse_args()

    if not os.getenv("GOOGLE_API_KEY"):
        raise SystemExit(
            "GOOGLE_API_KEY is not set. Copy .env.example to .env and add your key "
            "from Google AI Studio."
        )
    if not (args.files or args.url or args.text):
        raise SystemExit("Provide notes via a file argument, --text, or --url.")

    file_text, uploads = collect_files(args.files)
    combined_text = "\n\n".join(filter(None, [args.text, file_text])) or None

    parts = build_parts(text=combined_text, urls=args.url, files=uploads)
    result: IngestResult = await run_ingestion(parts)

    print(bank_to_json(result) if args.json else format_report(result))
    if not result.approved:
        print("\nNo questions survived validation. Check the source material.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))