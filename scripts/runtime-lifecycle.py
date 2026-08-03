#!/usr/bin/env python3
"""Operate on a stored CLI launch identifier without runtime-specific orchestration."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import signal
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any


SCRIPT_ROOT = Path(__file__).resolve().parent
DISPATCHER_PATH = SCRIPT_ROOT / "launch-runtime-agent.py"


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _records(state_dir: Path | None) -> list[tuple[Path, dict[str, Any]]]:
    if state_dir is None or not state_dir.exists():
        return []
    records: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted(state_dir.glob("launch-*.json")):
        try:
            value = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(value, dict):
            records.append((path, value))
    return records


def _record_for_identifier(
    state_dir: Path | None,
    identifier: str,
) -> tuple[Path, dict[str, Any]] | None:
    for path, record in _records(state_dir):
        if record.get("runtime_task_or_agent_id") == identifier:
            return path, record
    return None


def _result(payload: Mapping[str, Any], exit_code: int) -> int:
    print(json.dumps(dict(payload), sort_keys=True, separators=(",", ":")))
    return exit_code


def _status(state_dir: Path | None, identifier: str) -> int:
    match = _record_for_identifier(state_dir, identifier)
    if match is None:
        return _result(
            {
                "operation": "status",
                "status": "unknown",
                "runtime_task_or_agent_id": identifier,
                "adapter_error": "launch record was not found",
            },
            1,
        )
    path, record = match
    status = record.get("status")
    if status == "accepted":
        lifecycle_status = "completed"
    elif status == "rejected":
        lifecycle_status = "failed"
    else:
        lifecycle_status = str(status)
    process_id = record.get("pid")
    if lifecycle_status == "running" and isinstance(process_id, int):
        try:
            os.kill(process_id, 0)
        except OSError:
            lifecycle_status = "stale"
    return _result(
        {
            "operation": "status",
            "status": lifecycle_status,
            "runtime": record.get("runtime"),
            "runtime_task_or_agent_id": identifier,
            "exit_status": record.get("exit_status"),
            "record_path": str(path),
            "evidence_path": record.get("evidence_path"),
            "adapter_error": record.get("adapter_error"),
        },
        0 if lifecycle_status in ("running", "completed") else 1,
    )


def _cancel(state_dir: Path | None, identifier: str) -> int:
    match = _record_for_identifier(state_dir, identifier)
    if match is None:
        return _result(
            {
                "operation": "cancel",
                "status": "rejected",
                "runtime_task_or_agent_id": identifier,
                "adapter_error": "launch record was not found",
            },
            1,
        )
    path, record = match
    if record.get("status") != "running":
        return _result(
            {
                "operation": "cancel",
                "status": "completed",
                "runtime": record.get("runtime"),
                "runtime_task_or_agent_id": identifier,
                "record_path": str(path),
                "adapter_error": "launch is already complete; cancellation is not applicable",
            },
            1,
        )
    process_id = record.get("pid")
    if not isinstance(process_id, int):
        return _result(
            {
                "operation": "cancel",
                "status": "rejected",
                "runtime_task_or_agent_id": identifier,
                "adapter_error": "running launch has no process identifier",
            },
            1,
        )
    try:
        os.kill(process_id, signal.SIGTERM)
    except OSError as error:
        return _result(
            {
                "operation": "cancel",
                "status": "rejected",
                "runtime_task_or_agent_id": identifier,
                "adapter_error": str(error),
            },
            1,
        )
    record["status"] = "cancelled"
    record["adapter_error"] = None
    path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    return _result(
        {
            "operation": "cancel",
            "status": "cancelled",
            "runtime": record.get("runtime"),
            "runtime_task_or_agent_id": identifier,
            "record_path": str(path),
            "adapter_error": None,
        },
        0,
    )


def _follow_up(arguments: argparse.Namespace) -> int:
    dispatcher = _load_module(DISPATCHER_PATH, "adversarial_cycle_lifecycle_dispatcher")
    manifest = json.loads(Path(arguments.manifest).read_text())
    role = arguments.role
    config = dispatcher._role_config(manifest, role)
    if not isinstance(config, Mapping):
        return _result(
            {
                "operation": "follow-up",
                "status": "rejected",
                "runtime_task_or_agent_id": arguments.identifier,
                "adapter_error": f"role {role!r} is missing from manifest",
            },
            1,
        )
    adapter = config.get("launcher")
    if adapter not in dispatcher.SUPPORTED_ADAPTERS:
        return _result(
            {
                "operation": "follow-up",
                "status": "rejected",
                "runtime_task_or_agent_id": arguments.identifier,
                "adapter_error": f"unsupported launcher adapter: {adapter!r}",
            },
            1,
        )
    module = dispatcher._load_adapter(adapter)
    result = module.follow_up(
        manifest,
        role,
        arguments.identifier,
        arguments.task,
        arguments.review_round_spent,
        workspace=Path(arguments.workspace).expanduser().resolve(),
        evidence_dir=(
            Path(arguments.evidence_dir).expanduser().resolve()
            if arguments.evidence_dir is not None
            else None
        ),
        state_dir=(
            Path(arguments.state_dir).expanduser().resolve()
            if arguments.state_dir is not None
            else None
        ),
    )
    result = dispatcher._validate_result(
        result,
        manifest,
        role,
        config,
        arguments.review_round_spent,
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "accepted" else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("status", "follow-up", "cancel"))
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--identifier", required=True)
    parser.add_argument("--role")
    parser.add_argument("--task")
    parser.add_argument("--review-round-spent", type=int, default=0)
    parser.add_argument("--workspace", default=".")
    parser.add_argument("--evidence-dir")
    parser.add_argument("--state-dir")
    arguments = parser.parse_args(argv)
    state_dir = (
        Path(arguments.state_dir).expanduser().resolve()
        if arguments.state_dir is not None
        else None
    )
    try:
        if arguments.operation == "status":
            json.loads(Path(arguments.manifest).read_text())
            return _status(state_dir, arguments.identifier)
        if arguments.operation == "cancel":
            json.loads(Path(arguments.manifest).read_text())
            return _cancel(state_dir, arguments.identifier)
        if arguments.role is None or arguments.task is None:
            return _result(
                {
                    "operation": "follow-up",
                    "status": "rejected",
                    "runtime_task_or_agent_id": arguments.identifier,
                    "adapter_error": "follow-up requires --role and --task",
                },
                2,
            )
        return _follow_up(arguments)
    except (OSError, TypeError, ValueError, json.JSONDecodeError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
