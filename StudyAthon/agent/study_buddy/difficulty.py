"""The difficulty ladder.

``Question.difficulty`` is a free-text field the question writer fills in, and
the study loop needs to reason about it: a question answered correctly gets
rewritten *at the same difficulty*, and a fully-correct iteration escalates
everything one step. Neither operation is expressible while the value is an
unconstrained string, so this module is the single place that maps whatever the
model wrote onto an ordered ladder.

Three tiers, deliberately. A finer-grained scale (1-5, beginner/expert) would
need a rubric for what each rung means, and there is nothing in the notes to
calibrate it against. Hard is the ceiling: escalating past it would require
inventing a definition of "harder than hard" that a student could not perceive.
"""

from __future__ import annotations

# Ordered easiest-first. Index in this tuple *is* the rank.
TIERS: tuple[str, ...] = ("easy", "medium", "hard")

DEFAULT_TIER = "medium"

# The writer is instructed to emit exactly these three, but it is a language
# model and a session that dies on "Moderate" is worse than one that guesses.
_ALIASES: dict[str, str] = {
    "easy": "easy",
    "beginner": "easy",
    "basic": "easy",
    "introductory": "easy",
    "simple": "easy",
    "medium": "medium",
    "moderate": "medium",
    "intermediate": "medium",
    "normal": "medium",
    "hard": "hard",
    "difficult": "hard",
    "challenging": "hard",
    "advanced": "hard",
    "expert": "hard",
}


def normalize(value: str | None) -> str:
    """Coerce a model's difficulty label onto ``TIERS``.

    Unknown or missing values fall back to ``medium`` rather than raising. A
    mislabelled difficulty should cost a question its intended rung, not abort
    a study session the student is in the middle of. ``str`` coercion keeps a
    stray non-string (an int from a JSON payload) from raising too.
    """
    text = "" if value is None else str(value).strip().lower()
    if text in TIERS:
        return text
    return _ALIASES.get(text, DEFAULT_TIER)


def rank(value: str | None) -> int:
    """Position of ``value`` on the ladder, 0-based. Unknown values rank medium."""
    return TIERS.index(normalize(value))


def bump(value: str | None) -> str:
    """One step harder, saturating at ``hard``.

    The study loop calls this when a student clears an entire iteration. At the
    ceiling it returns ``hard`` unchanged, so a strong student keeps getting
    fresh questions at maximum difficulty rather than the loop ending or
    jumping to a tier that was never defined.
    """
    current = rank(value)
    return TIERS[min(current + 1, len(TIERS) - 1)]