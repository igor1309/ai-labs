import importlib.util
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[2]
LAUNCHER_ROOT = SKILL_ROOT / "scripts"


def load_module(path, module_name):
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_manifest(runtime, adapter, role, model, effort, context_mode="cold"):
    return {
        "schema_version": 1,
        "runtime": runtime,
        "adapter": adapter,
        "roles": {
            role: {
                "role": role,
                "runtime": runtime,
                "launcher": adapter,
                "model": model,
                "reasoning_effort": effort,
                "context_mode": context_mode,
            }
        },
    }


class RuntimeLauncherTests(unittest.TestCase):
    def load_launcher(self, launcher):
        path = LAUNCHER_ROOT / "launchers" / f"{launcher}.py"
        self.assertTrue(path.exists(), f"missing launcher: {path}")
        return load_module(path, f"runtime_launcher_{launcher}")

    def load_dispatcher(self):
        path = LAUNCHER_ROOT / "launch-runtime-agent.py"
        self.assertTrue(path.exists(), f"missing dispatcher: {path}")
        return load_module(path, "runtime_launcher_dispatcher")

    def test_claude_accepted_result_shouldPreserveTaskIdentifierAndInputs(self):
        launcher = self.load_launcher("claude")
        calls = []

        def native_launch(**arguments):
            calls.append(arguments)
            return {"status": "accepted", "task_id": "claude-task-1"}

        result = launcher.launch(
            make_manifest("claude", "claude", "implementer", "sonnet", "medium"),
            "implementer",
            "implement deterministic artifact",
            4,
            native_launch=native_launch,
        )

        self.assertEqual(
            result,
            {
                "role": "implementer",
                "runtime": "claude",
                "requested_model": "sonnet",
                "requested_effort": "medium",
                "status": "accepted",
                "runtime_task_or_agent_id": "claude-task-1",
                "adapter_error": None,
                "review_round_spent": 4,
            },
        )
        self.assertEqual(
            calls,
            [
                {
                    "model": "sonnet",
                    "effort": "medium",
                    "prompt": "implement deterministic artifact",
                    "role": "implementer",
                    "context_mode": "cold",
                }
            ],
        )

    def test_claude_rejected_result_shouldPreserveErrorAndUseOneAttempt(self):
        launcher = self.load_launcher("claude")
        calls = []
        exact_error = "unavailable-runtime-portability-test-model rejected by Claude"

        def native_launch(**arguments):
            calls.append(arguments)
            return {"status": "rejected", "error": exact_error}

        result = launcher.launch(
            make_manifest("claude", "claude", "reviewer", "unavailable-runtime-portability-test-model", "high"),
            "reviewer",
            "review artifact",
            7,
            native_launch=native_launch,
        )

        self.assertEqual(result["status"], "rejected")
        self.assertIsNone(result["runtime_task_or_agent_id"])
        self.assertEqual(result["adapter_error"], exact_error)
        self.assertEqual(result["review_round_spent"], 7)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["model"], "unavailable-runtime-portability-test-model")
        self.assertEqual(calls[0]["effort"], "high")

    def test_codex_accepted_cold_result_shouldUseNativeSpawnArguments(self):
        launcher = self.load_launcher("codex")
        calls = []

        def native_launch(**arguments):
            calls.append(arguments)
            return {"status": "accepted", "agent_id": "codex-agent-1"}

        result = launcher.launch(
            make_manifest("codex", "codex", "implementer", "gpt-5.6-luna", "max"),
            "implementer",
            "implement deterministic artifact",
            2,
            native_launch=native_launch,
        )

        self.assertEqual(result["status"], "accepted")
        self.assertEqual(result["runtime_task_or_agent_id"], "codex-agent-1")
        self.assertEqual(result["requested_model"], "gpt-5.6-luna")
        self.assertEqual(result["requested_effort"], "max")
        self.assertEqual(result["review_round_spent"], 2)
        self.assertEqual(
            calls,
            [
                {
                    "model": "gpt-5.6-luna",
                    "reasoning_effort": "max",
                    "prompt": "implement deterministic artifact",
                    "role": "implementer",
                    "fork_turns": "none",
                }
            ],
        )

    def test_codex_rejected_result_shouldPreserveErrorAndUseOneAttempt(self):
        launcher = self.load_launcher("codex")
        calls = []
        exact_error = "unavailable-runtime-portability-test-model rejected by Codex"

        def native_launch(**arguments):
            calls.append(arguments)
            return {"status": "rejected", "error": exact_error}

        result = launcher.launch(
            make_manifest("codex", "codex", "planner", "unavailable-runtime-portability-test-model", "high"),
            "planner",
            "plan artifact",
            1,
            native_launch=native_launch,
        )

        self.assertEqual(result["status"], "rejected")
        self.assertIsNone(result["runtime_task_or_agent_id"])
        self.assertEqual(result["adapter_error"], exact_error)
        self.assertEqual(result["review_round_spent"], 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["model"], "unavailable-runtime-portability-test-model")
        self.assertEqual(calls[0]["reasoning_effort"], "high")

    def test_claude_manifest_shouldNeverReachCodexAdapter(self):
        launcher = self.load_launcher("codex")
        calls = []

        def native_launch(**arguments):
            calls.append(arguments)
            return {"status": "accepted", "agent_id": "wrong"}

        result = launcher.launch(
            make_manifest("claude", "claude", "implementer", "sonnet", "medium"),
            "implementer",
            "task",
            0,
            native_launch=native_launch,
        )

        self.assertEqual(result["status"], "rejected")
        self.assertIsNone(result["runtime_task_or_agent_id"])
        self.assertEqual(calls, [])

    def test_codex_manifest_shouldNeverReachClaudeAdapter(self):
        launcher = self.load_launcher("claude")
        calls = []

        def native_launch(**arguments):
            calls.append(arguments)
            return {"status": "accepted", "task_id": "wrong"}

        result = launcher.launch(
            make_manifest("codex", "codex", "implementer", "gpt-5.6-terra", "medium"),
            "implementer",
            "task",
            0,
            native_launch=native_launch,
        )

        self.assertEqual(result["status"], "rejected")
        self.assertIsNone(result["runtime_task_or_agent_id"])
        self.assertEqual(calls, [])

    def test_shared_dispatcher_shouldSelectOnlyManifestAdapter(self):
        dispatcher = self.load_dispatcher()
        calls = []

        def native_launch(**arguments):
            calls.append(arguments)
            return {"status": "accepted", "agent_id": "dispatcher-agent-1"}

        result = dispatcher.launch(
            make_manifest("codex", "codex", "reviewer", "gpt-5.6-sol", "high"),
            "reviewer",
            "review artifact",
            3,
            native_launch=native_launch,
        )

        self.assertEqual(result["runtime_task_or_agent_id"], "dispatcher-agent-1")
        self.assertEqual(calls[0]["model"], "gpt-5.6-sol")


if __name__ == "__main__":
    unittest.main()
