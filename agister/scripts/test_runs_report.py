"""Tests for runs-report.py: python3 -m unittest, from agister/scripts."""

import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from collections import Counter

spec = importlib.util.spec_from_file_location(
    "runs_report", os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs-report.py"))
runs_report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runs_report)

SESSION = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"


def write_jsonl(path, events):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        for event in events:
            f.write(json.dumps(event) + "\n")


class CodexRelativeSkillReadTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.runs = os.path.join(tmp.name, "runs")
        self.sessions = os.path.join(tmp.name, "codex-sessions")
        self.cwd = os.path.join(tmp.name, "work")
        os.makedirs(os.path.join(self.runs, "run-1"))
        with open(os.path.join(self.runs, "run-1", "record.json"), "w") as f:
            json.dump({
                "id": "run-1",
                "process": "implement",
                "runtime": {"adapter": "codex", "version": "0.1"},
                "result": {"session": {"provider_session_id": SESSION}},
            }, f)

    def write_session(self, read_path):
        skills = "\n".join([
            "<skills_instructions>",
            "### Skill roots",
            f"- `r0` = `{os.path.join(self.cwd, '.agents', 'skills')}`",
            "### Available skills",
            "- demo: A demo skill. (file: r0/demo/SKILL.md)",
            "</skills_instructions>",
        ])
        write_jsonl(os.path.join(self.sessions, "2026", "09", "30", f"rollout-{SESSION}.jsonl"), [
            {"type": "turn_context", "payload": {"model": "gpt-test", "effort": "high", "cwd": self.cwd}},
            {"type": "response_item", "payload": {
                "type": "message", "role": "developer",
                "content": [{"type": "input_text", "text": skills}],
            }},
            {"type": "event_msg", "payload": {
                "type": "item_completed",
                "item": {
                    "type": "CommandExecution",
                    "parsed_cmd": [{"type": "read", "path": read_path}],
                },
            }},
        ])

    def test_relative_read_of_skill_md_counts_the_skill_used_once(self):
        self.write_session(".agents/skills/demo/SKILL.md")

        rows, had, used = runs_report.collect(self.runs, self.sessions)

        self.assertEqual(len(rows), 1)
        self.assertEqual(had["codex"], Counter({"demo": 1}))
        self.assertEqual(used["codex"], Counter({"demo": 1}))
        self.assertEqual(rows[0][-1], "demo×1")

    def test_relative_read_of_another_file_counts_nothing(self):
        self.write_session(".agents/skills/demo/README.md")

        rows, had, used = runs_report.collect(self.runs, self.sessions)

        self.assertEqual(len(rows), 1)
        self.assertEqual(had["codex"], Counter({"demo": 1}))
        self.assertEqual(used["codex"], Counter())
        self.assertEqual(rows[0][-1], "-")


class AgentEffortTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = tmp.name

    def layer(self, name, text):
        path = os.path.join(self.dir, name)
        with open(path, "w") as f:
            f.write(text)
        return {"layer": name, "path": path, "sha256": hashlib.sha256(text.encode()).hexdigest()}

    def effort(self, definition):
        return runs_report.agent_effort({"definitions": [{"kind": "agents", "name": "a", **definition}]})

    def test_the_nearest_layer_that_sets_the_effort_gives_it(self):
        project = self.layer("project", 'model = "m"\n')
        repository = self.layer("repository", 'effort = "low"\n')
        home = self.layer("home", 'effort = "high"\n')
        self.assertEqual(self.effort({"layers": [project, repository, home]}), "low")
        self.assertEqual(self.effort({"layers": [project, home]}), "high")
        self.assertEqual(self.effort({"layers": [project]}), "-")

    def test_a_layer_file_changed_since_the_run_gives_no_effort(self):
        project = self.layer("project", 'model = "m"\n')
        home = self.layer("home", 'effort = "high"\n')
        with open(project["path"], "w") as f:
            f.write('effort = "low"\n')
        self.assertEqual(self.effort({"layers": [project, home]}), "?")

    def test_a_record_from_before_the_layers_names_one_file(self):
        home = self.layer("home", 'effort = "high"\n')
        self.assertEqual(self.effort({"path": home["path"], "sha256": home["sha256"]}), "high")


if __name__ == "__main__":
    unittest.main()
