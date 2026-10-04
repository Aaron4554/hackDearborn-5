"""Tunable settings for the ingestion agents.

Every value is environment-driven so the team can retune without code changes.
See ``.env.example``.
"""

from __future__ import annotations

import os

# Gemini model used by every stage. ``-latest`` aliases also resolve on the
# Gemini Developer API, but pinning keeps runs reproducible.
MODEL = os.getenv("STUDYATHON_MODEL", "gemini-3.8-flash")

# Ordered fallbacks, tried when MODEL returns a capacity error. Every model here
# was verified to serve requests with an API key; note that `models.list()`
# advertises some models (gemini-2.5-flash, gemini-3.1-flash) that 404 on
# generate, so availability must be probed, not assumed.
MODEL_FALLBACKS = [
    m.strip()
    for m in os.getenv(
        "STUDYATHON_MODEL_FALLBACKS",
        "gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite",
    ).split(",")
    if m.strip()
]

# Retry/backoff for transient capacity errors. Four stages x four models at
# three attempts each is the ceiling on a single ingestion run.
RETRY_ATTEMPTS = int(os.getenv("STUDYATHON_RETRY_ATTEMPTS", "3"))
RETRY_BASE_DELAY = float(os.getenv("STUDYATHON_RETRY_BASE_DELAY", "2.0"))

# How many questions to generate per extracted concept.
QUESTIONS_PER_CONCEPT = int(os.getenv("STUDYATHON_QUESTIONS_PER_CONCEPT", "2"))

# Instructed ceiling on concepts per run. Keeps one request inside a sane
# output budget and stops us generating a thousand questions for a textbook.
MAX_CONCEPTS = int(os.getenv("STUDYATHON_MAX_CONCEPTS", "40"))

# Bounds on how many questions one study iteration may contain. The product
# spec fixes these at 1 and 50 inclusive. They are env-driven so a demo can be
# run with a smaller set without touching code.
MIN_QUESTIONS = int(os.getenv("STUDYATHON_MIN_QUESTIONS", "1"))
MAX_QUESTIONS = int(os.getenv("STUDYATHON_MAX_QUESTIONS", "50"))

# Output ceiling for the question-writing stage. Left generous because a
# truncated JSON payload fails schema validation and aborts the run.
WRITER_MAX_OUTPUT_TOKENS = int(
    os.getenv("STUDYATHON_WRITER_MAX_OUTPUT_TOKENS", "65536")
)


def resilient_model(candidates: list[str] | None = None):
    """Build the retry-and-fallback Gemini wrapper used by the ingestion stages."""
    from study_buddy.resilient import ResilientGemini

    # MODEL is usually also the first fallback, so dedupe while preserving order.
    ordered = list(dict.fromkeys(candidates or [MODEL, *MODEL_FALLBACKS]))
    return ResilientGemini(
        candidates=ordered,
        attempts_per_model=RETRY_ATTEMPTS,
        base_delay=RETRY_BASE_DELAY,
    )