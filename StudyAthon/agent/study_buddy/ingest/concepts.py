"""Stage 2 - concept extractor.

Splits the normalized notes into atomic, testable ideas. The important output
field is ``evidence_quote``: a verbatim slice of the notes that supports the
concept. It is what lets the grounding validator reject questions the model
invented, and what the app can later show as "from your notes".
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.genai import types

from study_buddy.ingest.common import SOURCE_NOTES, state_json
from study_buddy.schemas import ConceptSet
from study_buddy.settings import MAX_CONCEPTS, resilient_model


async def build_instruction(ctx: ReadonlyContext) -> str:
    notes = state_json(ctx, SOURCE_NOTES, {"sections": [], "key_terms": []})
    requested_count = ctx.state.get("question_count")
    count_guidance = (
        f"The quiz needs {requested_count} questions. Extract enough distinct, "
        "well-supported facts from the material to support that many non-repeated "
        "questions, using multiple facts from a topic when needed. Never invent "
        "facts to hit the target."
        if requested_count is not None
        else ""
    )
    return f"""\
You break study material into the smallest units that can each support exactly one \
multiple-choice question.

SOURCE NOTES (JSON):
{notes}

Produce at most {MAX_CONCEPTS} concepts.
{count_guidance}

A good concept is:
- atomic: one idea, not a bundle. "The cell divides" tests cleanly; "Cell division \
and mitosis" does not.
- self-contained: understandable without the surrounding paragraphs. Expand pronouns \
and resolve references to what they point at.
- specific enough to have a definite right answer and three clearly wrong ones.

Rules:
- Give each concept a short stable `id` like `c01`, and a `topic` grouping label.
- `evidence_quote` MUST be copied verbatim from the notes above. Do not paraphrase it. \
This is the check that keeps generated questions honest.
- Drop course logistics (schedules, office hours, grading policy) and anything you \
cannot state as a checkable claim.
- Merge duplicates. If two sections say the same thing, keep one concept.
"""


concept_extractor = LlmAgent(
    name="concept_extractor",
    model=resilient_model(),
    description="Splits notes into atomic, testable concepts with supporting quotes.",
    instruction=build_instruction,
    include_contents="none",
    output_schema=ConceptSet,
    output_key="concepts",
    generate_content_config=types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=32768,
    ),
)
