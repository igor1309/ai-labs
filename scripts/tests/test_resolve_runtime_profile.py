import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[2]
RESOLVER = SKILL_ROOT / "scripts" / "resolve-runtime-profile.py"


class ResolveRuntimeProfileTests(unittest.TestCase):
    def run_resolver(self, host, *overrides, profile=None):
        command = ["python3", str(RESOLVER), "--host", host]
        if profile is not None:
            command.extend(["--profile", str(profile)])
        for override in overrides:
            command.extend(["--set", override])
        return subprocess.run(
            command,
            cwd=SKILL_ROOT,
            capture_output=True,
            text=True,
        )

    def resolve(self, host, *overrides, profile=None):
        result = self.run_resolver(host, *overrides, profile=profile)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_default_claude_profile_shouldResolveConfiguredRoles(self):
        manifest = self.resolve("claude")

        self.assertEqual(manifest["runtime"], "claude")
        self.assertEqual(manifest["adapter"], "claude")
        self.assertEqual(manifest["roles"]["planner"]["model"], "opus")
        self.assertEqual(manifest["roles"]["implementer"]["reasoning_effort"], "medium")
        self.assertEqual(manifest["roles"]["implementer"]["access"], "workspace-write")
        self.assertEqual(manifest["roles"]["reviewer"]["context_mode"], "cold")

    def test_default_codex_profile_shouldResolveConfiguredRoles(self):
        manifest = self.resolve("codex")

        self.assertEqual(manifest["runtime"], "codex")
        self.assertEqual(manifest["adapter"], "codex")
        self.assertEqual(manifest["roles"]["planner"]["model"], "gpt-5.6-sol")
        self.assertEqual(manifest["roles"]["implementer"]["model"], "gpt-5.6-terra")
        self.assertEqual(manifest["independent_review"]["model"], "gpt-5.6-luna")
        self.assertEqual(manifest["roles"]["reviewer"]["executable"], "codex")

    def test_required_roles_shouldBePresent(self):
        manifest = self.resolve("codex")

        self.assertEqual(
            set(manifest["roles"]),
            {"planner", "implementer", "reviewer", "escalation"},
        )
        self.assertIn("independent_review", manifest)

    def test_literal_override_shouldHavePrecedenceOverProfile(self):
        manifest = self.resolve(
            "codex",
            "implementer.model=caller-model",
            "implementer.effort=low",
        )
        implementer = manifest["roles"]["implementer"]

        self.assertEqual(implementer["model"], "caller-model")
        self.assertEqual(implementer["reasoning_effort"], "low")
        self.assertEqual(implementer["source"], "caller-literal")

    def test_luna_max_preset_shouldExpandAtomically(self):
        manifest = self.resolve("codex", "implementer=luna-max")
        implementer = manifest["roles"]["implementer"]

        self.assertEqual(implementer["model"], "gpt-5.6-luna")
        self.assertEqual(implementer["reasoning_effort"], "max")
        self.assertEqual(implementer["source"], "caller-preset")

    def test_conflicting_preset_effort_shouldBeRejected(self):
        result = self.run_resolver(
            "codex",
            "implementer=luna-max",
            "implementer.effort=high",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("conflicting", result.stderr.lower())

    def test_host_profile_mismatch_shouldBeRejected(self):
        result = self.run_resolver(
            "claude",
            profile=SKILL_ROOT / "runtime" / "codex.toml",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("host", result.stderr.lower())
        self.assertIn("codex", result.stderr.lower())

    def test_missing_required_profile_fields_shouldBeRejected(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            profile = Path(temporary_directory) / "incomplete.toml"
            profile.write_text(
                """
schema_version = 1
runtime = "codex"
launcher = "codex"
executable = "codex"
provider = "openai"
unavailable_model_policy = "stop"

[roles.planner]
model = "gpt-5.6-sol"
reasoning_effort = "high"
context_mode = "warm"
access = "read-only"
""".strip()
                + "\n"
            )
            result = self.run_resolver("codex", profile=profile)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing", result.stderr.lower())

    def test_unavailable_model_policy_shouldStopWithoutFallback(self):
        manifest = self.resolve(
            "codex",
            "implementer.model=unavailable-runtime-portability-test-model",
            "implementer.effort=medium",
        )
        encoded_manifest = json.dumps(manifest)

        self.assertEqual(manifest["unavailable_model_policy"], "stop")
        self.assertEqual(
            manifest["roles"]["implementer"]["model"],
            "unavailable-runtime-portability-test-model",
        )
        self.assertNotIn("fallback", encoded_manifest.lower())

    def test_unknown_host_shouldBeRejected(self):
        result = self.run_resolver("unknown")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("host", result.stderr.lower())


if __name__ == "__main__":
    unittest.main()
