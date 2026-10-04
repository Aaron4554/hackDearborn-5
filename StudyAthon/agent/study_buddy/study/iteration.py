"""Builds the next iteration of a study session from loop directives.

``rules.py`` decides *what* should happen to each question. This module is the
one place that asks a model to carry that out, and it does so in a single batched
call per iteration rather than one call per question. At 20 requests per model per
day that difference is the whole budget: a fifty-question iteration is one request
here, not fifty.

The directives are passed as the user message rather than through session state
because this agent runs standalone, once per iteration, and threading state keys
through a Runner for a one-shot call would buy nothing.

Directives that resolve without a model (``CARRY``, ``DROP``) never reach this
file; ``session.py`` merges those in alongside the questions returned here.
"""

from __future__ import annotations

import json
from typing import Any, Iterable, Mapping, Sequence

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from study_buddy.difficulty import TIERS
from study_buddy.schemas import QuestionSet
from study_buddy.settings import WRITER_MAX_OUTPUT_TOKENS, resilient_model
from study_buddy.study.rules import QuestionPlan

APP_NAME = "studyathon_iteration"

INSTRUCTION = """\
You write the next iteration of a multiple-choice study session. You are given a \
list of directives, one per question from the iteration the student just finished. \
Every directive tells you what to do with that question. Return exactly one \
question per directive, with the same `id`.

## The directives

**rewrite** - the student answered this correctly. Write a DIFFERENT question that \
tests the same concept, at the same difficulty. They have already proved they know \
this, so re-asking anything recognisable wastes their time. Change the angle, the \
scenario, or what is being asked about.

**reword** - the student got this wrong and then read the answer. Test the same \
concept, at the same difficulty, but phrase everything differently: new stem, new \
option wording. They have seen the answer to the old phrasing, so the question has \
to be genuinely fresh on the surface while the idea underneath is unchanged.

**harder** - the student answered the whole set correctly. Write a new question on \
the same concept at the difficulty named in the directive. Push on application, \
edge cases, and multi-step reasoning rather than restating a fact.

## Every question you return needs

- exactly four `options`, and a `correct_index` between 0 and 3 pointing at the \
right one
- a `difficulty` exactly equal to the directive's `difficulty` value, which is one \
of easy, medium, or hard. Do not re-label it.
- the directive's `concept_id` unchanged, so progress stays attributed to the right \
idea
- the `evidence_quote` copied from the source material for that concept, unchanged
- an `explanation` saying why the right option is right and why the most tempting \
wrong one is wrong
- a stem under 30 words that is self-contained

## Distractors decide whether this is useful

A wrong option must be something a student who half-remembered the material would \
genuinely pick. Draw them from the classic misconception for this topic, a \
neighbouring concept, or the right idea with one detail altered. Never write an \
absurd or unrelated option, a giveaway by length or grammar, "all of the above", or \
an option that could defensibly also be correct.

Vary which index is correct across the questions you write, and keep stems away from \
"except", "not", and "which is false" - those invite misreads.

## Grounding

Write only about concepts present in the source material below. If a directive's \
concept has no supporting text in the sources, still write the question but keep it \
strictly within the concept's own statement rather than inventing detail.
"""


iteration_writer = LlmAgent(
    name="iteration_writer",
    model=resilient_model(),
    description="Writes the next iteration of a study session from loop directives.",
    instruction=INSTRUCTION,
    include_contents="none",
    output_schema=QuestionSet,
    output_key="questions",
    generate_content_config=types.GenerateContentConfig(
        temperature=0.7,
        max_output_tokens=WRITER_MAX_OUTPUT_TOKENS,
    ),
)


_session_service = InMemorySessionService()


def build_payload(
    plans: Sequence[QuestionPlan],
    questions_by_id: Mapping[str, Mapping[str, Any]],
    concepts: Iterable[Mapping[str, Any]] = (),
) -> str:
    """Render the directives and their source questions as the agent's input.

    ``CARRY`` and ``DROP`` plans are filtered out here rather than by the caller,
    so this is the only place that has to remember they cost nothing.
    """
    directives = []
    for plan in plans:
        if not plan.needs_generation:
            continue
        source = questions_by_id.get(plan.question_id)
        if source is None:
            # Nothing to work from; the caller drops these rather than asking the
            # model to invent a question for an id it has never seen.
            continue
        directives.append(
            {
                "id": plan.question_id,
                "directive": plan.directive.value,
                "difficulty": plan.difficulty,
                "concept_id": source.get("concept_id", ""),
                "previous_question": {
                    "stem": source.get("stem", ""),
                    "options": source.get("options") or [],
                    "correct_index": source.get("correct_index", 0),
                    "explanation": source.get("explanation", ""),
                    "evidence_quote": source.get("evidence_quote", ""),
                },
            }
        )

    return json.dumps(
        {
            "ladders": list(TIERS),
            "directives": directives,
            "concepts": list(concepts),
        },
        indent=2,
        ensure_ascii=False,
    )


async def run_iteration_writer(
    payload: str,
    *,
    user_id: str = "studyathon-user",
) -> list[dict[str, Any]]:
    """Execute one batched iteration and return the new questions.

    Raises ``RuntimeError`` when the writer produces nothing usable, which for a
    live session means a 502 at the endpoint rather than a silently empty
    iteration the student cannot finish.
    """
    if not payload.strip() or '"directives": []' in payload:
        # Every directive resolved without a model call; the caller keeps the
        # carried questions and never reaches this function.
        return []

    session = await _session_service.create_session(
        app_name=APP_NAME, user_id=user_id
    )
    runner = Runner(
        agent=iteration_writer,
        app_name=APP_NAME,
        session_service=_session_service,
    )

    try:
        async for _event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.Content(
                role="user", parts=[types.Part(text=payload)]
            ),
        ):
            pass

        final = await _session_service.get_session(
            app_name=APP_NAME, user_id=user_id, session_id=session.id
        )
        state = final.state if final else {}
    finally:
        await _session_service.delete_session(
            app_name=APP_NAME, user_id=user_id, session_id=session.id
        )

    questions = (state.get("questions") or {}).get("questions") or []
    if not questions:
        raise RuntimeError("The iteration writer produced no questions.")

    return questions