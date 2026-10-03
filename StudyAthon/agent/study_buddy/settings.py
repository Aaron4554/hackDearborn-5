"""Tunable settings for the ingestion agents.

Every value is environment-driven so the team can retune without code changes.
See ``.env.example``.
"""

from __future__ import annotations

import os

# Gemini model used by every stage. ``-latest`` aliases also resolve on the
# Gemini Developer API, but pinning keeps runs reproducible.
MODEL = os.getenv("STUDYATHON_MODEL", "gemini-3.8-flash")

# How many questions to generate per extracted concept.
QUESTIONS_PER_CONCEPT = int(os.getenv("STUDYATHON_QUESTIONS_PER_CONCEPT", "2"))

# Instructed ceiling on concepts per run. Keeps one request inside a sane
# output budget and stops us generating a thousand questions for a textbook.
MAX_CONCEPTS = int(os.getenv("STUDYATHON_MAX_CONCEPTS", "40"))

# Output ceiling for the question-writing stage. Left generous because a
# truncated JSON payload fails schema validation and aborts the run.
WRITER_MAX_OUTPUT_TOKENS = int(
    os.getenv("STUDYATHON_WRITER_MAX_OUTPUT_TOKENS", "65536")
)