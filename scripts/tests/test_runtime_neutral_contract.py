import re
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[2]
SKILL_PATH = SKILL_ROOT / "SKILL.md"


class RuntimeNeutralContractTests(unittest.TestCase):
    def test_shared_skill_shouldNotOwnRuntimeSpecificLaunchVocabulary(self):
        text = SKILL_PATH.read_text()
        forbidden_patterns = {
            "profile-owned model alias": r"\b(?:opus|sonnet)\b|gpt-5\.6-",
            "native launch primitive": r"\bTask\b|\bspawn_agent\b",
            "standalone review gate": r"codex-judge\s+flow|(?:call|invoke|run|use).{0,50}codex-judge.{0,50}(?:gate|review)",
        }
        violations = [
            f"{label}: {pattern}"
            for label, pattern in forbidden_patterns.items()
            if re.search(pattern, text)
        ]

        self.assertEqual(violations, [])

    def test_shared_skill_shouldRetainRuntimeNeutralCycleContract(self):
        text = SKILL_PATH.read_text()
        required_fragments = [
            "scripts/resolve-runtime-profile.py",
            "scripts/launch-runtime-agent.py",
            "scripts/runtime-lifecycle.py",
            "canonical execution manifest",
            "one Implementer",
            "fresh cold Reviewer",
            "two fix rounds",
            "codex-audit",
            "done",
            "stopped",
            "receipt",
            "review_round_spent",
        ]
        missing = [fragment for fragment in required_fragments if fragment not in text]

        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
