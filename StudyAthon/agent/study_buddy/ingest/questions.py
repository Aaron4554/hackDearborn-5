"""Stage 3 - question writer.

Distractor quality is the whole game here. A question that any student can
answer by eliminating three obviously-wrong options tests nothing, and that is
the most common failure mode when a model writes MCQs. The instruction below
pushes hard on plausible-but-wrong options drawn from real misconceptions.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.genai import types

from study_buddy.ingest.common import CONCEPTS, state_json
from study_buddy.schemas import QuestionSet
from study_buddy.settings import MODEL, QUESTIONS_PER_CONCEPT, WRITER_MAX_OUTPUT_TOKENS


async def build_instruction(ctx: ReadonlyContext) -> str:
    concepts = state_json(ctx, CONCEPTS, {"concepts": []})
    return f"""\
You write multiple-choice questions that check real understanding of a student's notes.

CONCEPTS (JSON):
{concepts}

Write exactly {QUESTIONS_PER_CONCEPT} questions for EVERY concept, so each concept's \
`concept_id` appears {QUESTIONS_PER_CONCEPT} times.

Each question needs exactly four options and a `correct_index` (0-based) pointing at \
the right one.

## Distractors are where this task is won or lost

A wrong option must be something a student who half-remembered the material would \
genuinely pick. Draw them from:
- the classic misconception this topic is known for
- a neighbouring concept from the same notes, swapped in
- the right idea with one detail altered (a flipped sign, transposed steps, \
the wrong axis, the wrong case)
- a correct fact from an adjacent topic that does not apply here

Never write a distractor that is:
- absurd, insulting, or unrelated to the topic ("purple monkey dishwasher")
- a giveaway by length or grammar ("the answer is obviously X because...")
- "all of the above", "none of the above", or "it depends"
- arguably also correct. If two options could both be defended, rewrite the stem \
so only one is.

## Stems

- Ask for the specific thing, not "what is true about X".
- Never use "except", "not", or "which is false" - they invite misreads.
- Keep each stem under 30 words and self-contained.
- Vary the answer position across questions. Do not put the correct answer at \
index 0 every time.
- Copy the concept's `evidence_quote` onto the question unchanged, and write an \
`explanation` that says why the right option is right and the tempting one is wrong.
- Label `difficulty` honestly as easy, medium, or hard.
"""


question_writer = LlmAgent(
    name="question_writer",
    model=MODEL,
    description="Writes grounded multiple-choice questions with plausible distractors.",
    instruction=build_instruction,
    include_contents="none",
    output_schema=QuestionSet,
    output_key="questions",
    generate_content_config=types.GenerateContentConfig(
        # Higher than the other stages: variety in phrasing and distractors is
        # the point, and the grounding validator catches errors afterwards.
        temperature=0.7,
        max_output_tokens=WRITER_MAX_OUTPUT_TOKENS,
    ),
)