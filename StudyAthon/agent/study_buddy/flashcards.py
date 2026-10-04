"""Flashcard generator agent for StudyAthon.

Generates concise, high-yield flashcard decks from study topics or custom notes.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field

from study_buddy.settings import resilient_model

APP_NAME = "studyathon_flashcards"


class FlashcardItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    front: str = ""
    back: str = ""
    hint: str = ""


class FlashcardDeckSchema(BaseModel):
    topic: str = ""
    cards: list[FlashcardItem] = Field(default_factory=list)


INSTRUCTION = """\
You are an expert educational study assistant that creates high-yield flashcards for students.
Given a topic or source notes and a target card count, generate a focused, comprehensive flashcard deck.

Guidelines for Flashcards:
• Front: A clear, specific question, key term, concept, or prompt that triggers active recall.
• Back: A concise, accurate, and easy-to-digest answer or explanation (1-3 sentences max).
• Hint: A brief optional memory cue or contextual hint to help the student if they get stuck.
• Structure: Cover the most foundational definitions, key mechanisms, formulas, and critical distinctions.
• Language & Plain Text: Format with plain text. Use standard LaTeX with $...$ for math or science formulas.
• Quality: Ensure the front is not a giveaway, and the back is strictly accurate and easy to remember.
"""

flashcard_agent = LlmAgent(
    name="flashcard_generator",
    model=resilient_model(),
    description="Generates flashcards for a given topic or study notes.",
    instruction=INSTRUCTION,
    include_contents="none",
    output_schema=FlashcardDeckSchema,
    output_key="deck",
    generate_content_config=types.GenerateContentConfig(
        temperature=0.5,
    ),
)

_session_service = InMemorySessionService()


async def generate_flashcards(
    *,
    topic: str | None = None,
    text: str | None = None,
    count: int = 8,
    user_id: str = "studyathon-user",
) -> dict[str, Any]:
    """Generate a deck of flashcards using the resilient ADK agent."""
    subject = (topic or "").strip()
    material = (text or "").strip()

    if not subject and not material:
        raise ValueError("Either a topic or study notes text must be provided.")

    prompt_payload = json.dumps(
        {
            "topic": subject or "Study Material",
            "source_notes": material,
            "target_card_count": max(3, min(20, count)),
        },
        ensure_ascii=False,
    )

    session = await _session_service.create_session(
        app_name=APP_NAME, user_id=user_id
    )
    runner = Runner(
        agent=flashcard_agent,
        app_name=APP_NAME,
        session_service=_session_service,
    )

    try:
        async for _event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.Content(
                role="user", parts=[types.Part(text=prompt_payload)]
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

    deck = (state.get("deck") or {})
    cards = deck.get("cards") or []

    # Assign IDs and clean up cards
    formatted_cards = []
    for index, card in enumerate(cards):
        front = (card.get("front") or "").strip()
        back = (card.get("back") or "").strip()
        if front and back:
            formatted_cards.append(
                {
                    "id": str(card.get("id") or f"card_{index + 1}"),
                    "front": front,
                    "back": back,
                    "hint": (card.get("hint") or "").strip(),
                }
            )

    if not formatted_cards:
        raise RuntimeError("Could not generate flashcards for this topic.")

    return {
        "topic": deck.get("topic") or subject or "Study Deck",
        "cards": formatted_cards,
    }
