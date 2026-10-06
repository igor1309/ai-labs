import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_ROOT = SKILL_ROOT / "scripts"
RESOLVER = SCRIPT_ROOT / "resolve-runtime-profile.py"
DISPATCHER = SCRIPT_ROOT / "launch-runtime-agent.py"
LIFECYCLE = SCRIPT_ROOT / "runtime-lifecycle.py"


class RuntimeLauncherTests(unittest.TestCase):
    def make_stub(self, directory, runtime):
        path = Path(directory) / runtime
        path.write_text(
            """#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

record_path = Path(os.environ["STUB_RECORD"])
records = json.loads(record_path.read_text()) if record_path.exists() else []
records.append({"argv": sys.argv[1:], "cwd": os.getcwd(), "stdin": sys.stdin.read()})
record_path.write_text(json.dumps(records, indent=2))

arguments = sys.argv[1:]
if "--output-last-message" in arguments:
    message_path = Path(arguments[arguments.index("--output-last-message") + 1])
    message_path.write_text("stub last message\\n")

if os.environ.get("STUB_FAIL") == "1":
    sys.stdout.write(os.environ.get("STUB_STDOUT", "stub stdout\\n"))
    sys.stderr.write(os.environ.get("STUB_STDERR", "chosen model rejected\\n"))
    raise SystemExit(int(os.environ.get("STUB_EXIT", "7")))

identifier = os.environ.get("STUB_IDENTIFIER", "stub-session-1")
if Path(sys.argv[0]).name == "claude":
    print(json.dumps({"type": "result", "session_id": identifier}))
else:
    print(json.dumps({"type": "thread.started", "thread_id": identifier}))
    print(json.dumps({"type": "turn.completed"}))
"""
        )
        path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def make_environment(self, bin_directory, record_path, **values):
        environment = os.environ.copy()
        environment["PATH"] = f"{bin_directory}{os.pathsep}{environment['PATH']}"
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        environment["STUB_RECORD"] = str(record_path)
        environment.update(values)
        return environment

    def resolve_manifest(self, temporary_path, host, *overrides):
        command = ["python3", str(RESOLVER), "--host", host]
        for override in overrides:
            command.extend(["--set", override])
        result = subprocess.run(
            command,
            cwd=SKILL_ROOT,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise AssertionError(result.stderr)
        manifest_path = Path(temporary_path) / f"{host}-manifest.json"
        manifest_path.write_text(result.stdout)
        return manifest_path

    def run_public(
        self,
        manifest_path,
        role,
        workspace,
        evidence_directory,
        state_directory,
        environment,
        task="deterministic task",
        review_round_spent="0",
    ):
        return subprocess.run(
            [
                "python3",
                str(DISPATCHER),
                "--manifest",
                str(manifest_path),
                "--role",
                role,
                "--task",
                task,
                "--review-round-spent",
                review_round_spent,
                "--workspace",
                str(workspace),
                "--evidence-dir",
                str(evidence_directory),
                "--state-dir",
                str(state_directory),
            ],
            cwd=SKILL_ROOT,
            capture_output=True,
            text=True,
            env=environment,
        )

    def load_result(self, process):
        return json.loads(process.stdout)

    def normalize_output_path(self, arguments):
        normalized = list(arguments)
        if "--output-last-message" in normalized:
            index = normalized.index("--output-last-message") + 1
            normalized[index] = "<message>"
        return normalized

    def test_public_entry_shouldLaunchResolvedCodexWithoutInjectedCallback(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            bin_directory = temporary_path / "bin"
            bin_directory.mkdir()
            self.make_stub(bin_directory, "codex")
            record_path = temporary_path / "calls.json"
            environment = self.make_environment(
                bin_directory,
                record_path,
                STUB_IDENTIFIER="codex-thread-1",
            )
            manifest_path = self.resolve_manifest(
                temporary_path,
                "codex",
                "implementer=luna-max",
            )
            launch_result = self.run_public(
                manifest_path,
                "implementer",
                temporary_path,
                temporary_path / "evidence",
                temporary_path / "state",
                environment,
                task="implement deterministic artifact",
            )
            result = self.load_result(launch_result)
            calls = json.loads(record_path.read_text())
            normalized_arguments = self.normalize_output_path(calls[0]["argv"])

        self.assertEqual(
            (launch_result.returncode, result["status"], result["runtime_task_or_agent_id"], normalized_arguments),
            (
                0,
                "accepted",
                "codex-thread-1",
                [
                    "exec",
                    "--json",
                    "--model",
                    "gpt-5.6-luna",
                    "-c",
                    'model_reasoning_effort="max"',
                    "-c",
                    'approval_policy="never"',
                    "--sandbox",
                    "workspace-write",
                    "--cd",
                    str(temporary_path.resolve()),
                    "--output-last-message",
                    "<message>",
                    "--ignore-user-config",
                    "-",
                ],
            ),
        )

    def test_claude_public_entry_shouldUseExactArgumentsAndSessionIdentifier(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            bin_directory = temporary_path / "bin"
            bin_directory.mkdir()
            self.make_stub(bin_directory, "claude")
            record_path = temporary_path / "calls.json"
            environment = self.make_environment(
                bin_directory,
                record_path,
                STUB_IDENTIFIER="claude-session-1",
            )
            manifest_path = self.resolve_manifest(temporary_path, "claude")
            launch_result = self.run_public(
                manifest_path,
                "implementer",
                temporary_path,
                temporary_path / "evidence",
                temporary_path / "state",
                environment,
                task="implement deterministic artifact",
            )
            result = self.load_result(launch_result)
            calls = json.loads(record_path.read_text())

        self.assertEqual(
            (launch_result.returncode, result["runtime_task_or_agent_id"], calls[0]["argv"], calls[0]["stdin"]),
            (
                0,
                "claude-session-1",
                [
                    "--print",
                    "--output-format",
                    "json",
                    "--model",
                    "sonnet",
                    "--effort",
                    "medium",
                    "--permission-mode",
                    "acceptEdits",
                ],
                "implement deterministic artifact",
            ),
        )

    def test_cli_failure_shouldPreserveStreamsStatusAndNoFallback(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            bin_directory = temporary_path / "bin"
            bin_directory.mkdir()
            self.make_stub(bin_directory, "codex")
            record_path = temporary_path / "calls.json"
            environment = self.make_environment(
                bin_directory,
                record_path,
                STUB_FAIL="1",
                STUB_STDOUT="stdout sentinel\n",
                STUB_STDERR="exact rejection\n",
                STUB_EXIT="23",
            )
            manifest_path = self.resolve_manifest(
                temporary_path,
                "codex",
                "implementer.model=unavailable-runtime-portability-test-model",
                "implementer.effort=max",
            )
            evidence_directory = temporary_path / "evidence"
            launch_result = self.run_public(
                manifest_path,
                "implementer",
                temporary_path,
                evidence_directory,
                temporary_path / "state",
                environment,
                review_round_spent="11",
            )
            result = self.load_result(launch_result)
            calls = json.loads(record_path.read_text())
            evidence_path = next(evidence_directory.glob("implementer-*"))
            evidence = {
                "exit": (evidence_path / "exit-status.txt").read_text(),
                "stdout": (evidence_path / "stdout.txt").read_text(),
                "stderr": (evidence_path / "stderr.txt").read_text(),
            }

        self.assertEqual(
            (
                launch_result.returncode,
                result["status"],
                result["requested_model"],
                result["requested_effort"],
                result["adapter_error"],
                result["review_round_spent"],
                len(calls),
                evidence,
            ),
            (
                1,
                "rejected",
                "unavailable-runtime-portability-test-model",
                "max",
                "exact rejection\n",
                11,
                1,
                {
                    "exit": "23\n",
                    "stdout": "stdout sentinel\n",
                    "stderr": "exact rejection\n",
                },
            ),
        )

    def test_read_only_roles_shouldUseReadOnlyModesAndColdLaunches(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            bin_directory = temporary_path / "bin"
            bin_directory.mkdir()
            self.make_stub(bin_directory, "claude")
            self.make_stub(bin_directory, "codex")
            claude_record_path = temporary_path / "claude-calls.json"
            codex_record_path = temporary_path / "codex-calls.json"
            claude_environment = self.make_environment(
                bin_directory,
                claude_record_path,
            )
            codex_environment = self.make_environment(
                bin_directory,
                codex_record_path,
            )
            claude_manifest = self.resolve_manifest(temporary_path, "claude")
            codex_manifest = self.resolve_manifest(temporary_path, "codex")
            self.run_public(
                claude_manifest,
                "reviewer",
                temporary_path,
                temporary_path / "claude-evidence",
                temporary_path / "claude-state",
                claude_environment,
            )
            self.run_public(
                codex_manifest,
                "reviewer",
                temporary_path,
                temporary_path / "codex-evidence",
                temporary_path / "codex-state",
                codex_environment,
            )
            claude_arguments = json.loads(claude_record_path.read_text())[0]["argv"]
            codex_arguments = json.loads(codex_record_path.read_text())[0]["argv"]

        self.assertEqual(
            (
                "--permission-mode" in claude_arguments,
                claude_arguments[claude_arguments.index("--permission-mode") + 1],
                "--resume" in claude_arguments,
                "--sandbox" in codex_arguments,
                codex_arguments[codex_arguments.index("--sandbox") + 1],
                "resume" in codex_arguments,
            ),
            (True, "plan", False, True, "read-only", False),
        )

    def test_lifecycle_status_shouldConsumeManifestFromPipe(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            bin_directory = temporary_path / "bin"
            bin_directory.mkdir()
            self.make_stub(bin_directory, "codex")
            record_path = temporary_path / "calls.json"
            environment = self.make_environment(
                bin_directory,
                record_path,
                STUB_IDENTIFIER="codex-thread-pipe",
            )
            manifest_path = self.resolve_manifest(temporary_path, "codex")
            evidence_directory = temporary_path / "evidence"
            state_directory = temporary_path / "state"
            launch_result = self.run_public(
                manifest_path,
                "implementer",
                temporary_path,
                evidence_directory,
                state_directory,
                environment,
            )
            identifier = self.load_result(launch_result)["runtime_task_or_agent_id"]
            padded_manifest_path = temporary_path / "padded-manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["padding"] = "x" * 131072
            padded_manifest_path.write_text(json.dumps(manifest))
            writer_path = temporary_path / "manifest-writer.py"
            writer_path.write_text(
                "import sys\n"
                "from pathlib import Path\n"
                "sys.stdout.write(Path(sys.argv[1]).read_text())\n"
            )
            writer = subprocess.Popen(
                ["python3", str(writer_path), str(padded_manifest_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=environment,
            )
            status_result = subprocess.run(
                [
                    "python3",
                    str(LIFECYCLE),
                    "status",
                    "--manifest",
                    "/dev/stdin",
                    "--identifier",
                    identifier,
                    "--state-dir",
                    str(state_directory),
                ],
                cwd=SKILL_ROOT,
                stdin=writer.stdout,
                capture_output=True,
                text=True,
                env=environment,
            )
            writer.stdout.close()
            writer_stderr = writer.communicate()[1]

        self.assertEqual(
            (
                launch_result.returncode,
                status_result.returncode,
                json.loads(status_result.stdout)["status"],
                writer.returncode,
                writer_stderr,
            ),
            (0, 0, "completed", 0, ""),
        )

    def test_lifecycle_shouldStatusFollowUpAndReportCompletedCancellation(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            bin_directory = temporary_path / "bin"
            bin_directory.mkdir()
            self.make_stub(bin_directory, "codex")
            record_path = temporary_path / "calls.json"
            environment = self.make_environment(
                bin_directory,
                record_path,
                STUB_IDENTIFIER="codex-thread-lifecycle",
            )
            manifest_path = self.resolve_manifest(temporary_path, "codex")
            evidence_directory = temporary_path / "evidence"
            state_directory = temporary_path / "state"
            launch_result = self.run_public(
                manifest_path,
                "implementer",
                temporary_path,
                evidence_directory,
                state_directory,
                environment,
            )
            identifier = self.load_result(launch_result)["runtime_task_or_agent_id"]
            status_result = subprocess.run(
                [
                    "python3",
                    str(LIFECYCLE),
                    "status",
                    "--manifest",
                    str(manifest_path),
                    "--identifier",
                    identifier,
                    "--state-dir",
                    str(state_directory),
                ],
                cwd=SKILL_ROOT,
                capture_output=True,
                text=True,
                env=environment,
            )
            follow_up_result = subprocess.run(
                [
                    "python3",
                    str(LIFECYCLE),
                    "follow-up",
                    "--manifest",
                    str(manifest_path),
                    "--identifier",
                    identifier,
                    "--role",
                    "implementer",
                    "--task",
                    "follow-up task",
                    "--review-round-spent",
                    "1",
                    "--workspace",
                    str(temporary_path),
                    "--evidence-dir",
                    str(evidence_directory),
                    "--state-dir",
                    str(state_directory),
                ],
                cwd=SKILL_ROOT,
                capture_output=True,
                text=True,
                env=environment,
            )
            cancel_result = subprocess.run(
                [
                    "python3",
                    str(LIFECYCLE),
                    "cancel",
                    "--manifest",
                    str(manifest_path),
                    "--identifier",
                    identifier,
                    "--state-dir",
                    str(state_directory),
                ],
                cwd=SKILL_ROOT,
                capture_output=True,
                text=True,
                env=environment,
            )
            calls = json.loads(record_path.read_text())
            follow_up_arguments = calls[1]["argv"]

        self.assertEqual(
            (
                status_result.returncode,
                json.loads(status_result.stdout)["status"],
                follow_up_result.returncode,
                json.loads(follow_up_result.stdout)["status"],
                self.normalize_output_path(follow_up_arguments),
                cancel_result.returncode,
                json.loads(cancel_result.stdout)["status"],
            ),
            (
                0,
                "completed",
                0,
                "accepted",
                [
                    "exec",
                    "resume",
                    "--json",
                    "codex-thread-lifecycle",
                    "--model",
                    "gpt-5.6-terra",
                    "-c",
                    'model_reasoning_effort="medium"',
                    "-c",
                    'approval_policy="never"',
                    "--output-last-message",
                    "<message>",
                    "--ignore-user-config",
                    "-",
                ],
                1,
                "completed",
            ),
        )


if __name__ == "__main__":
    unittest.main()
