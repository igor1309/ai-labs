"""Tests for codex-sandbox-contract.py: python3 -m unittest, from agister/scripts."""

import importlib.util
import json
import os
import unittest

spec = importlib.util.spec_from_file_location(
    "contract", os.path.join(os.path.dirname(os.path.abspath(__file__)), "codex-sandbox-contract.py"))
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


def events(*items):
    return "\n".join(json.dumps(item) for item in items)


class ReadEvents(unittest.TestCase):
    def test_the_probes_output_and_the_thread_come_from_the_events(self):
        stdout = events(
            {"type": "thread.started", "thread_id": "t-1"},
            {"type": "item.completed", "item": {"type": "command_execution", "command": "ls", "aggregated_output": "README"}},
            {"type": "item.completed", "item": {"type": "command_execution", "command": "bash -lc 'sh probe.sh'",
                                                "aggregated_output": "read file=ok\n"}},
            {"type": "item.completed", "item": {"type": "agent_message", "text": "read file=refused"}},
        )
        self.assertEqual(contract.read_events(stdout + "\nnot json"), ("t-1", "read file=ok\n"))

    def test_a_turn_that_never_ran_the_probe_has_no_output(self):
        stdout = events({"type": "item.completed", "item": {"type": "agent_message", "text": "write in home=refused"}})
        self.assertEqual(contract.read_events(stdout), (None, None))


class Outcomes(unittest.TestCase):
    def test_each_line_is_an_action_and_its_result(self):
        self.assertEqual(contract.outcomes("read file=ok\nwrite in home=refused\nnoise\nx=maybe\n"),
                         {"read file": "ok", "write in home": "refused"})


class Expected(unittest.TestCase):
    def test_only_reads_are_allowed_read_only(self):
        want = contract.expected("read-only")
        self.assertEqual({n for n, r in want.items() if r == "ok"}, {"read file", "git show"})
        self.assertEqual(want, contract.expected("resumed read-only"))

    def test_workspace_write_allows_the_workspace_and_tmp_only(self):
        want = contract.expected("workspace-write")
        self.assertEqual({n for n, r in want.items() if r == "ok"},
                         {"read file", "git show", "write in repository", "write under /tmp"})


class ProbeScript(unittest.TestCase):
    def test_every_action_is_tried_with_the_runs_token(self):
        script = contract.probe_script("abc")
        for name, _ in contract.ACTIONS:
            self.assertIn(f"echo '{name}=ok'", script)
        self.assertIn("/tmp/agister-contract-abc", script)
        self.assertNotIn("TOKEN", script)


if __name__ == "__main__":
    unittest.main()
