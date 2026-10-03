"""The note-ingestion agent graph.

Turns raw study material (pasted text, a PDF, slide photos, a lecture
recording) into a validated bank of multiple-choice questions.

    SequentialAgent "studyathon_ingest"
      1. source_normalizer   raw input      -> source_notes
      2. concept_extractor   source_notes   -> concepts
      3. question_writer     concepts       -> questions
      4. grounding_validator questions      -> question_bank
      5. bank_reporter       question_bank  -> human-readable summary

Session state is the whiteboard between stages. Stages 2-5 run with
``include_contents='none'`` so the PDF is never re-sent and each agent sees only
its instruction plus the state it needs.
"""

from study_buddy.ingest.pipeline import ingest_pipeline, root_agent

__all__ = ["ingest_pipeline", "root_agent"]