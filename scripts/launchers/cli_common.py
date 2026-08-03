"""Shared subprocess, evidence, and launch-record helpers for CLI adapters."""

from __future__ import annotations

import json
import subprocess
import tempfile
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ProcessResult:
    command: tuple[str, ...]
    cwd: Path
    stdout: str
    stderr: str
    returncode: int
    output_last_message: Path | None


def run_cli(
    command: list[str],
    task: str,
    workspace: Path,
    output_last_message: Path | None = None,
) -> ProcessResult:
    completed = subprocess.run(
        command,
        cwd=workspace,
        input=task,
        capture_output=True,
        text=True,
        check=False,
    )
    return ProcessResult(
        command=tuple(command),
        cwd=workspace,
        stdout=completed.stdout,
        stderr=completed.stderr,
        returncode=completed.returncode,
        output_last_message=output_last_message,
    )


def failure_output(process: ProcessResult) -> str:
    if process.stderr:
        return process.stderr
    if process.stdout:
        return process.stdout
    return f"CLI exited with status {process.returncode}"


def json_records(output: str) -> list[Any]:
    records: list[Any] = []
    try:
        return [json.loads(output)]
    except json.JSONDecodeError:
        pass
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def prepare_evidence(root: Path | None, role: str) -> tuple[Path, Any]:
    if root is None:
        temporary_directory = tempfile.TemporaryDirectory(
            prefix=f"adversarial-cycle-{role}-"
        )
        return Path(temporary_directory.name), temporary_directory.cleanup
    root.mkdir(parents=True, exist_ok=True)
    directory = root / f"{role}-{uuid.uuid4().hex}"
    directory.mkdir()
    return directory, lambda: None


def record_evidence(
    directory: Path,
    request: Mapping[str, Any],
    process: ProcessResult,
    result: Mapping[str, Any],
) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "request.json").write_text(
        json.dumps(dict(request), indent=2, sort_keys=True) + "\n"
    )
    (directory / "argv.json").write_text(
        json.dumps(list(process.command), indent=2) + "\n"
    )
    (directory / "cwd.txt").write_text(str(process.cwd) + "\n")
    (directory / "stdin.txt").write_text(str(request.get("task", "")))
    (directory / "stdout.txt").write_text(process.stdout)
    (directory / "stderr.txt").write_text(process.stderr)
    (directory / "exit-status.txt").write_text(f"{process.returncode}\n")
    if process.output_last_message is not None and process.output_last_message.exists():
        (directory / "last-message.txt").write_text(
            process.output_last_message.read_text()
        )
    (directory / "result.json").write_text(
        json.dumps(dict(result), indent=2, sort_keys=True) + "\n"
    )


def record_launch(
    state_directory: Path | None,
    request: Mapping[str, Any],
    process: ProcessResult,
    result: Mapping[str, Any],
    evidence_directory: Path,
) -> None:
    if state_directory is None:
        return
    state_directory.mkdir(parents=True, exist_ok=True)
    record = {
        "role": request["role"],
        "runtime": request["runtime"],
        "model": request["model"],
        "reasoning_effort": request["reasoning_effort"],
        "access": request["access"],
        "workspace": str(process.cwd),
        "command": list(process.command),
        "exit_status": process.returncode,
        "status": result["status"],
        "runtime_task_or_agent_id": result["runtime_task_or_agent_id"],
        "adapter_error": result["adapter_error"],
        "evidence_path": str(evidence_directory),
    }
    path = state_directory / f"launch-{uuid.uuid4().hex}.json"
    path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
