"""Pydantic schemas for the note-ingestion pipeline.

ADK validates an agent's final message against ``output_schema`` and stores the
*parsed* result in session state, so these models are the contract between
stages. Every field has a default on purpose: a slightly-off model response
should still validate, because a validation error aborts the whole run. Strict
rejection is the grounding validator's job, not Pydantic's.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SourceNotes(BaseModel):
    """Normalized study material, regardless of the original format."""

    title: str = "Untitled notes"
    source_kind: str = "notes"
    sections: list[str] = Field(default_factory=list)
    key_terms: list[str] = Field(default_factory=list)


class Concept(BaseModel):
    """One atomic, testable idea extracted from the notes."""

    id: str = ""
    topic: str = ""
    statement: str = ""
    evidence_quote: str = ""


class ConceptSet(BaseModel):
    concepts: list[Concept] = Field(default_factory=list)


class Question(BaseModel):
    """A multiple-choice question built from a single concept.

    ``options`` is deliberately not constrained to exactly four entries. A hard
    constraint here would raise during validation and kill the run; the
    grounding validator flags malformed questions and rejects them instead.
    """

    id: str = ""
    concept_id: str = ""
    stem: str = ""
    options: list[str] = Field(default_factory=list)
    correct_index: int = 0
    explanation: str = ""
    evidence_quote: str = ""
    difficulty: str = "medium"


class QuestionSet(BaseModel):
    questions: list[Question] = Field(default_factory=list)


class Rejection(BaseModel):
    question_id: str = ""
    reason: str = ""


class QuestionBank(BaseModel):
    """The validated output of ingestion."""

    approved: list[Question] = Field(default_factory=list)
    rejected: list[Rejection] = Field(default_factory=list)
    coverage_gaps: list[str] = Field(default_factory=list)