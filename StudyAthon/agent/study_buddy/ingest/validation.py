"""Stage 4 - grounding validator.

The quality gate. Generated questions fail in predictable ways - the stem asks
about something the notes never state, two options are both defensible, the
correct index points past the end of the list - and a student hitting those loses
trust in the whole app. This stage drops them and records why.

It is deliberately the last LLM stage before persistence, and it copies the
approved questions through unchanged rather than rewriting them, so the
validator can only ever remove questions, never introduce new ones.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.genai import types

from study_buddy.ingest.common import CONCEPTS, QUESTIONS, state_json
from study_buddy.schemas import QuestionBank
from study_buddy.settings import MODEL


async def build_instruction(ctx: ReadonlyContext) -> str:
    concepts = state_json(ctx, CONCEPTS, {"concepts": []})
    questions = state_json(ctx, QUESTIONS, {"questions": []})
    return f"""\
You are the quality gate for a study app. You will be given concepts extracted from a \
student's notes and questions generated from those concepts. Decide which questions \
survive.

CONCEPTS (JSON):
{concepts}

QUESTIONS (JSON):
{questions}

## Reject a question if any of these hold

1. Not supported - the answer is not derivable from the concept's statement and \
evidence quote. This is the most important check. Prefer rejecting over excusing.
2. Ambiguous - two or more options can be defended as correct.
3. No valid answer - `correct_index` is out of range for `options`, or no option \
matches the concept.
4. Malformed - fewer than 4 options, an empty stem, or a duplicated option.
5. Trick wording - uses "except", "not", "which is false", or similar traps.
6. Untestable - asks about course logistics, or about something the notes only \
mention in passing without stating.

## Approve a question only if

- The correct option follows from the cited evidence quote.
- Exactly one option is correct.
- Every wrong option is topically plausible and clearly incorrect to someone who \
understood the material.
- The explanation is accurate.

Copy approved questions through **verbatim**. Do not edit wording, reorder options, \
or change any field. Reproduce them exactly as given.

Put every rejected question's `id` and a short specific `reason` in `rejected`. Be \
precise about what was wrong - it is the only signal we have for fixing the writer.

In `coverage_gaps`, list any concept from the concept list that has no approved \
question, so we know what the notes covered but the quiz does not.
"""


grounding_validator = LlmAgent(
    name="grounding_validator",
    model=MODEL,
    description="Rejects questions that are ungrounded, ambiguous, or malformed.",
    instruction=build_instruction,
    include_contents="none",
    output_schema=QuestionBank,
    output_key="question_bank",
    generate_content_config=types.GenerateContentConfig(
        # Near-deterministic: this stage judges, it does not create.
        temperature=0.1,
        max_output_tokens=65536,
    ),
)