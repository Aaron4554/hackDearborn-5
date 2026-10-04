"""Tests for the study loop's pure transition rules.

Deliberately model-free, like ``test_ingest``: the loop rules decide what a
student sees next iteration, and a wrong rule is indistinguishable from a bad
model response once you are watching a live session. Every branch here costs no
quota, so this file is the cheap place to be certain about the loop.

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import unittest

from study_buddy.difficulty import DEFAULT_TIER, TIERS, bump, normalize, rank
from study_buddy.study.rules import (
    Attempt,
    Directive,
    Outcome,
    clamp_question_count,
    plan_next_iteration,
    public_view,
    public_views,
    requires_reveal,
    should_escalate,
)


def _attempt(qid: str, outcome: Outcome, difficulty: str = "medium") -> Attempt:
    return Attempt(question_id=qid, difficulty=difficulty, outcome=outcome)


class TestDifficultyNormalize(unittest.TestCase):
    def test_canonical_values_pass_through(self):
        for tier in TIERS:
            self.assertEqual(normalize(tier), tier)

    def test_case_and_whitespace_tolerated(self):
        self.assertEqual(normalize("  HARD "), "hard")
        self.assertEqual(normalize("Medium"), "medium")

    def test_synonyms_collapse_onto_the_ladder(self):
        for word in ("beginner", "basic", "introductory"):
            self.assertEqual(normalize(word), "easy")
        for word in ("moderate", "intermediate"):
            self.assertEqual(normalize(word), "medium")
        for word in ("challenging", "advanced", "expert"):
            self.assertEqual(normalize(word), "hard")

    def test_unknown_values_fall_back_rather_than_raise(self):
        # A session must not die because the writer invented a label.
        for value in (None, "", "spicy", "impossible", 3):
            self.assertEqual(normalize(value), DEFAULT_TIER)


class TestDifficultyBump(unittest.TestCase):
    def test_each_tier_climbs_one_step(self):
        self.assertEqual(bump("easy"), "medium")
        self.assertEqual(bump("medium"), "hard")

    def test_hard_is_a_ceiling(self):
        # A strong student keeps getting fresh questions at max difficulty
        # rather than the loop ending or escalating into an undefined tier.
        self.assertEqual(bump("hard"), "hard")

    def test_bump_is_idempotent_at_the_top(self):
        self.assertEqual(bump(bump("hard")), "hard")

    def test_bump_normalizes_first(self):
        self.assertEqual(bump("beginner"), "medium")
        self.assertEqual(bump(None), "hard")

    def test_rank_orders_the_ladder(self):
        self.assertLess(rank("easy"), rank("medium"))
        self.assertLess(rank("medium"), rank("hard"))


class TestPlanAllCorrect(unittest.TestCase):
    def test_clean_sweep_escalates_every_answer(self):
        attempts = [
            _attempt("q1", Outcome.CORRECT, "easy"),
            _attempt("q2", Outcome.CORRECT, "medium"),
            _attempt("q3", Outcome.CORRECT, "hard"),
        ]
        plans = plan_next_iteration(attempts, reveal_answers=False)

        self.assertEqual([p.directive for p in plans], [Directive.HARDER] * 3)
        self.assertEqual([p.difficulty for p in plans], ["medium", "hard", "hard"])

    def test_escalation_ignores_the_reveal_decision(self):
        attempts = [_attempt("q1", Outcome.CORRECT)]
        # Nothing was wrong, so the student was never offered answers.
        self.assertEqual(
            plan_next_iteration(attempts, reveal_answers=True)[0].directive,
            Directive.HARDER,
        )

    def test_unanswered_questions_are_ignored_not_treated_as_wrong(self):
        attempts = [
            _attempt("q1", Outcome.CORRECT, "easy"),
            _attempt("q2", Outcome.UNANSWERED, "medium"),
            _attempt("q3", Outcome.CORRECT, "hard"),
        ]
        plans = plan_next_iteration(attempts, reveal_answers=False)

        self.assertEqual([p.question_id for p in plans], ["q1", "q3"])
        self.assertTrue(should_escalate(attempts))
        self.assertFalse(requires_reveal(attempts))


class TestPlanMixedOutcomes(unittest.TestCase):
    def test_correct_rewrites_wrong_rewords_when_answers_seen(self):
        attempts = [
            _attempt("q1", Outcome.CORRECT, "easy"),
            _attempt("q2", Outcome.INCORRECT, "hard"),
        ]
        plans = plan_next_iteration(attempts, reveal_answers=True)

        by_id = {p.question_id: p for p in plans}
        self.assertEqual(by_id["q1"].directive, Directive.REWRITE)
        self.assertEqual(by_id["q1"].difficulty, "easy")
        self.assertEqual(by_id["q2"].directive, Directive.REWORD)
        self.assertEqual(by_id["q2"].difficulty, "hard")

    def test_correct_rewrites_wrong_carries_when_answers_declined(self):
        attempts = [
            _attempt("q1", Outcome.CORRECT, "easy"),
            _attempt("q2", Outcome.INCORRECT, "hard"),
        ]
        plans = plan_next_iteration(attempts, reveal_answers=False)

        by_id = {p.question_id: p for p in plans}
        self.assertEqual(by_id["q1"].directive, Directive.REWRITE)
        self.assertEqual(by_id["q2"].directive, Directive.CARRY)

    def test_one_incorrect_answer_blocks_escalation(self):
        attempts = [
            _attempt("q1", Outcome.CORRECT),
            _attempt("q2", Outcome.CORRECT),
            _attempt("q3", Outcome.INCORRECT),
        ]
        self.assertFalse(should_escalate(attempts))
        self.assertTrue(requires_reveal(attempts))
        self.assertNotIn(
            Directive.HARDER, [p.directive for p in plan_next_iteration(attempts, reveal_answers=True)]
        )

    def test_unanswered_is_dropped_in_the_mixed_branch_too(self):
        attempts = [
            _attempt("q1", Outcome.INCORRECT),
            _attempt("q2", Outcome.UNANSWERED),
            _attempt("q3", Outcome.CORRECT),
        ]
        plans = plan_next_iteration(attempts, reveal_answers=True)
        by_id = {p.question_id: p for p in plans}

        self.assertEqual(by_id["q2"].directive, Directive.DROP)
        self.assertEqual(by_id["q1"].directive, Directive.REWORD)
        self.assertEqual(by_id["q3"].directive, Directive.REWRITE)

    def test_all_wrong_declined_carries_everything_at_no_model_cost(self):
        # The quota-relevant case: a student who never takes a hint should be
        # able to keep retrying the same set for free.
        attempts = [_attempt(f"q{i}", Outcome.INCORRECT) for i in range(5)]
        plans = plan_next_iteration(attempts, reveal_answers=False)

        self.assertTrue(all(p.directive is Directive.CARRY for p in plans))
        self.assertFalse(any(p.needs_generation for p in plans))


class TestGenerationCost(unittest.TestCase):
    def test_only_rewrite_reword_harder_hit_the_model(self):
        self.assertTrue(Directive.REWRITE.needs_generation)
        self.assertTrue(Directive.REWORD.needs_generation)
        self.assertTrue(Directive.HARDER.needs_generation)
        self.assertFalse(Directive.CARRY.needs_generation)
        self.assertFalse(Directive.DROP.needs_generation)

    def test_needs_generation_reads_from_the_plan(self):
        plans = plan_next_iteration(
            [_attempt("q1", Outcome.INCORRECT)], reveal_answers=False
        )
        self.assertFalse(plans[0].needs_generation)


class TestDegenerateSets(unittest.TestCase):
    def test_no_attempts_yields_no_plans(self):
        # Nothing attempted means nothing to carry forward; the session should
        # finish rather than open an empty iteration.
        self.assertEqual(plan_next_iteration([], reveal_answers=False), [])

    def test_everything_unanswered_yields_no_plans(self):
        attempts = [_attempt(f"q{i}", Outcome.UNANSWERED) for i in range(3)]
        plans = plan_next_iteration(attempts, reveal_answers=False)

        self.assertEqual(plans, [])
        # Ignored questions are not failures, so this is still a clean sweep.
        self.assertTrue(should_escalate(attempts))
        self.assertFalse(requires_reveal(attempts))


class TestClampQuestionCount(unittest.TestCase):
    def test_in_range_values_pass_through(self):
        self.assertEqual(clamp_question_count(1), 1)
        self.assertEqual(clamp_question_count(25), 25)
        self.assertEqual(clamp_question_count(50), 50)

    def test_out_of_range_values_clamp_to_the_spec_bounds(self):
        self.assertEqual(clamp_question_count(0), 1)
        self.assertEqual(clamp_question_count(-5), 1)
        self.assertEqual(clamp_question_count(51), 50)
        self.assertEqual(clamp_question_count(10_000), 50)

    def test_missing_value_defaults_to_the_minimum(self):
        self.assertEqual(clamp_question_count(None), 1)


class TestPublicView(unittest.TestCase):
    def setUp(self):
        self.question = {
            "id": "q1",
            "concept_id": "c1",
            "stem": "Which index speeds up range scans?",
            "options": ["B-tree", "Hash", "Bitmap", "None"],
            "correct_index": 0,
            "explanation": "A B-tree keeps keys sorted.",
            "evidence_quote": "a b-tree keeps rows ordered",
            "difficulty": "medium",
        }

    def test_answer_bearing_fields_never_leave_the_server(self):
        # correct_index is the score itself and explanation states it in words.
        view = public_view(self.question)
        for leaked in ("correct_index", "explanation", "evidence_quote"):
            self.assertNotIn(leaked, view)

    def test_the_student_still_gets_everything_needed_to_answer(self):
        view = public_view(self.question)
        for key in ("id", "stem", "options", "difficulty", "concept_id"):
            self.assertIn(key, view)
        self.assertEqual(len(view["options"]), 4)

    def test_input_is_not_mutated(self):
        public_view(self.question)
        self.assertIn("correct_index", self.question)

    def test_batch_matches_single_view(self):
        batch = public_views([self.question, self.question])
        self.assertEqual(batch, [public_view(self.question)] * 2)
        self.assertEqual(len(batch), 2)

    def test_unknown_fields_pass_through(self):
        # Don't silently swallow anything a future stage adds to a question.
        view = public_view({**self.question, "concept_hint": "indexes"})
        self.assertEqual(view["concept_hint"], "indexes")


if __name__ == "__main__":
    unittest.main()