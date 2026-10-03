"""The ingestion agent graph.

    SequentialAgent "studyathon_ingest"
      1. source_normalizer   raw input      -> source_notes
      2. concept_extractor   source_notes   -> concepts
      3. question_writer     concepts       -> questions
      4. grounding_validator questions      -> question_bank

Each stage writes its parsed result into session state via ``output_key`` and the
next one reads it back through its instruction, so the stages never pass large
payloads to each other directly.

Deliberately *not* used here: ``LoopAgent``. It is deprecated in ADK 2.11 in
favour of the graph-based ``Workflow``, which is not yet exported from
``google.adk.agents``. If per-concept batching is ever needed (a whole textbook
in one upload overruns the writer's output budget), the replacement is a
``Workflow`` with a dynamic fan-out over concept batches, not a ``LoopAgent``.
"""

from __future__ import annotations

from google.adk.agents import SequentialAgent

from study_buddy.ingest.concepts import concept_extractor
from study_buddy.ingest.questions import question_writer
from study_buddy.ingest.sources import source_normalizer
from study_buddy.ingest.validation import grounding_validator

ingest_pipeline = SequentialAgent(
    name="studyathon_ingest",
    description=(
        "Ingests raw study material and produces a validated bank of "
        "multiple-choice questions grounded in the source."
    ),
    sub_agents=[
        source_normalizer,
        concept_extractor,
        question_writer,
        grounding_validator,
    ],
)

# ADK tooling (adk web / api_server) looks for this name. The FastAPI server
# imports `ingest_pipeline` explicitly, so the alias is only for convenience.
root_agent = ingest_pipeline

__all__ = ["ingest_pipeline", "root_agent"]