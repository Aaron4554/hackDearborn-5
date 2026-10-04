"""Stage 1 - source normalizer.

The only stage that sees the original bytes. Pasted text, PDFs, slide photos and
lecture links all arrive as parts on the user message, and Gemini reads them
directly, so there is no separate download/OCR step.

Downstream stages run with ``include_contents='none'``, so this is the one place
that pays for the multimodal input.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.genai import types

from study_buddy.schemas import SourceNotes
from study_buddy.settings import resilient_model

INSTRUCTION = """\
You are the intake step of StudyAthon. The user has supplied raw study material \
- it may be pasted notes, a PDF of lecture slides, a photo of a whiteboard, a \
transcript, or any mix of these.

Read everything you were given and rewrite it as clean, well-organized study notes.

Rules:
- Preserve every substantive fact. Compress repetition, filler, and page furniture.
- If the material contains diagrams, tables, or equations, transcribe what they mean \
in prose rather than describing the layout.
- Split the material into `sections`, one string per topic. Keep each section \
self-contained.
- Put proper nouns, technical terms, and formula names in `key_terms`.
- For actual notes, files, or transcripts, never introduce facts that are not in \
the supplied material. If those materials are too thin, say so rather than padding them.
- First decide whether a text input is actual study material or a short topic/request. \
If it is a short request such as "human anatomy" or "teach me photosynthesis", use \
the named topic as the scope and write concise, accurate introductory notes from \
established knowledge so a quiz can be built. Keep every note tightly within that \
requested topic. If the input contains notes, slides, a transcript, or other real \
course material, use those as the source of truth and do not supplement them.
- Set `source_kind` to the dominant input format: notes, slides, pdf, transcript, or mixed.
"""

source_normalizer = LlmAgent(
    name="source_normalizer",
    model=resilient_model(),
    description="Turns raw notes, PDFs, slides, or recordings into clean study notes.",
    instruction=INSTRUCTION,
    # Must see the real PDF/image parts, not just the instruction.
    include_contents="default",
    output_schema=SourceNotes,
    output_key="source_notes",
    generate_content_config=types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=32768,
    ),
)
