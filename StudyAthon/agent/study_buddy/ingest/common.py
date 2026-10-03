"""Shared helpers for the ingestion stages.

Two things live here:

* the session-state keys the stages hand off through, and
* ``state_json``, which serializes a state value for an instruction template.

The helper exists because ADK's built-in ``{key}`` template substitution does
``str(value)`` on the raw state entry. Our state holds parsed JSON *dicts*, so
the default substitution would splice a Python ``repr`` (single quotes, ``True``
instead of ``true``) into the prompt. Passing real JSON is both valid for the
model and far easier to read.
"""

from __future__ import annotations

import json
from typing import Any

from google.adk.agents.readonly_context import ReadonlyContext

# Session-state keys written by ``output_key`` on each stage.
SOURCE_NOTES = "source_notes"
CONCEPTS = "concepts"
QUESTIONS = "questions"
QUESTION_BANK = "question_bank"


def state_json(ctx: ReadonlyContext, key: str, fallback: Any = None) -> str:
    """Render ``key`` from session state as indented JSON.

    Missing keys become an explicit empty payload rather than raising, so a
    stage never crashes on a partially-populated state.
    """
    value = ctx.state.get(key)
    if value is None:
        value = fallback
    return json.dumps(value, indent=2, ensure_ascii=False, default=str)