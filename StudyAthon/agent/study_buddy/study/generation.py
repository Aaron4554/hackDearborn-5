"""Turns loop directives into the next iteration's questions.

The merge here is the reason a student who declines every explanation can keep
retrying the same questions without spending quota: ``CARRY`` questions are
replayed from the previous iteration verbatim and never reach the writer, so a
whole iteration can cost zero model calls.

Only directives that survive ``rules.needs_generation`` are sent to the model, in
one batched call. Questions the writer fails to return are dropped rather than
padding the set with a duplicate, which would let a student farm the same
question by ignoring the ones they find hard.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Sequence

from study_buddy.difficulty import normalize
from study_buddy.study.iteration import build_payload, run_iteration_writer
from study_buddy.study.rules import Directive, QuestionPlan


def _index_by_id(questions: Iterable[Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        str(q["id"]): dict(q)
        for q in questions
        if q.get("id")
    }


async def build_next_iteration(
    *,
    plans: Sequence[QuestionPlan],
    questions_by_id: Mapping[str, Mapping[str, Any]],
    concepts: Iterable[Mapping[str, Any]] = (),
    user_id: str = "studyathon-user",
    learner_profile: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Produce the questions for the next iteration, in directive order.

    Returns an empty list when nothing is worth asking, which the caller treats
    as a reason to end the session rather than to open an empty iteration.
    """
    carried = {
        str(qid): dict(q)
        for qid, q in ((p.question_id, questions_by_id.get(p.question_id)) for p in plans)
        if q is not None
    }

    to_generate = [plan for plan in plans if plan.needs_generation]
    generated: dict[str, dict[str, Any]] = {}
    if to_generate:
        payload = build_payload(to_generate, questions_by_id, concepts, learner_profile)
        for question in await run_iteration_writer(payload, user_id=user_id):
            qid = str(question.get("id", ""))
            if qid:
                generated[qid] = dict(question)

    merged: list[dict[str, Any]] = []
    for plan in plans:
        if plan.directive is Directive.DROP:
            continue
        if plan.directive is Directive.CARRY:
            source = carried.get(plan.question_id)
            if source is not None:
                merged.append(source)
            continue

        produced = generated.get(plan.question_id)
        if produced is None:
            # The writer skipped this directive. Dropping it keeps the set honest
            # rather than repeating a question the student just got right.
            continue
        # The loop's ladder is authoritative; a model that re-labels difficulty
        # must not silently demote a question the student is about to be
        # escalated onto.
        produced["difficulty"] = normalize(plan.difficulty)
        merged.append(produced)

    return merged
