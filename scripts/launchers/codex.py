"""Codex CLI adapter for the runtime-neutral adversarial-cycle launcher."""

from __future__ import annotations

import json
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any


LAUNCHER_ROOT = Path(__file__).resolve().parent
if str(LAUNCHER_ROOT) not in sys.path:
    sys.path.insert(0, str(LAUNCHER_ROOT))

from cli_common import (  # noqa: E402
    ProcessResult,
    failure_output,
    json_records,
    prepare_evidence,
    record_evidence,
    record_launch,
    run_cli,
)


def _role_config(manifest: Mapping[str, Any], role: str) -> Mapping[str, Any] | None:
    roles = manifest.get("roles")
    if isinstance(roles, Mapping) and isinstance(roles.get(role), Mapping):
        return roles[role]
    if role in ("independent_review", "independent-review"):
        independent_review = manifest.get("independent_review")
        if isinstance(independent_review, Mapping):
            return independent_review
    return None


def _error_result(
    role: str,
    config: Mapping[str, Any] | None,
    review_round_spent: Any,
    error: str,
) -> dict[str, Any]:
    return {
        "role": role,
        "runtime": config.get("runtime", "codex") if config else "codex",
        "requested_model": config.get("model") if config else None,
        "requested_effort": config.get("reasoning_effort") if config else None,
        "status": "rejected",
        "runtime_task_or_agent_id": None,
        "adapter_error": error,
        "review_round_spent": review_round_spent,
    }


def _sandbox(config: Mapping[str, Any]) -> str:
    access = config["access"]
    if access == "read-only":
        return "read-only"
    if access == "workspace-write":
        return "workspace-write"
    raise ValueError(f"unsupported access mode: {access!r}")


def _config_argument(key: str, value: str) -> str:
    return f"{key}={json.dumps(value)}"


def _command(
    config: Mapping[str, Any],
    workspace: Path,
    output_last_message: Path,
    follow_up_identifier: str | None = None,
) -> list[str]:
    if follow_up_identifier is None:
        return [
            config["executable"],
            "exec",
            "--json",
            "--model",
            config["model"],
            "-c",
            _config_argument("model_reasoning_effort", config["reasoning_effort"]),
            "-c",
            _config_argument("approval_policy", "never"),
            "--sandbox",
            _sandbox(config),
            "--cd",
            str(workspace),
            "--output-last-message",
            str(output_last_message),
            "--ignore-user-config",
            "-",
        ]
    return [
        config["executable"],
        "exec",
        "resume",
        "--json",
        follow_up_identifier,
        "--model",
        config["model"],
        "-c",
        _config_argument("model_reasoning_effort", config["reasoning_effort"]),
        "-c",
        _config_argument("approval_policy", "never"),
        "--output-last-message",
        str(output_last_message),
        "--ignore-user-config",
        "-",
    ]


def _identifier(output: str) -> str | None:
    records = json_records(output)
    for record in records:
        if not isinstance(record, Mapping):
            continue
        if record.get("type") == "thread.started":
            identifier = record.get("thread_id")
            if isinstance(identifier, str) and identifier:
                return identifier
    for record in records:
        if not isinstance(record, Mapping):
            continue
        identifier = record.get("thread_id")
        if isinstance(identifier, str) and identifier:
            return identifier
    return None


def _run(
    role: str,
    task: str,
    review_round_spent: Any,
    config: Mapping[str, Any],
    workspace: Path,
    evidence_dir: Path | None,
    state_dir: Path | None,
    follow_up_identifier: str | None = None,
) -> dict[str, Any]:
    evidence_directory, cleanup = prepare_evidence(
        evidence_dir or state_dir,
        role,
    )
    try:
        output_last_message = evidence_directory / "last-message.raw"
        command = _command(
            config,
            workspace,
            output_last_message,
            follow_up_identifier,
        )
        try:
            process = run_cli(command, task, workspace, output_last_message)
        except OSError as error:
            process = ProcessResult(
                command=tuple(command),
                cwd=workspace,
                stdout="",
                stderr=str(error),
                returncode=127,
                output_last_message=output_last_message,
            )
        if process.returncode != 0:
            result = _error_result(
                role,
                config,
                review_round_spent,
                failure_output(process),
            )
        else:
            identifier = _identifier(process.stdout)
            if identifier is None:
                result = _error_result(
                    role,
                    config,
                    review_round_spent,
                    "Codex CLI returned no thread identifier",
                )
            else:
                result = {
                    "role": role,
                    "runtime": config["runtime"],
                    "requested_model": config["model"],
                    "requested_effort": config["reasoning_effort"],
                    "status": "accepted",
                    "runtime_task_or_agent_id": identifier,
                    "adapter_error": None,
                    "review_round_spent": review_round_spent,
                }
        request = {
            "role": role,
            "runtime": config["runtime"],
            "model": config["model"],
            "reasoning_effort": config["reasoning_effort"],
            "access": config["access"],
            "context_mode": config["context_mode"],
            "task": task,
            "follow_up_identifier": follow_up_identifier,
        }
        record_evidence(evidence_directory, request, process, result)
        record_launch(state_dir, request, process, result, evidence_directory)
        return result
    except ValueError as error:
        return _error_result(role, config, review_round_spent, str(error))
    finally:
        cleanup()


def launch(
    manifest: Mapping[str, Any],
    role: str,
    task: str,
    review_round_spent: Any,
    *,
    workspace: Path | None = None,
    evidence_dir: Path | None = None,
    state_dir: Path | None = None,
) -> dict[str, Any]:
    config = _role_config(manifest, role)
    if config is None:
        return _error_result(role, None, review_round_spent, f"role {role!r} is missing from manifest")
    if (
        (manifest.get("adapter") != "codex" and role != "independent_review")
        or config.get("launcher") != "codex"
        or config.get("runtime") != "codex"
    ):
        return _error_result(
            role,
            config,
            review_round_spent,
            "manifest runtime/launcher does not belong to Codex adapter",
        )
    try:
        return _run(
            role,
            task,
            review_round_spent,
            config,
            workspace or Path.cwd(),
            evidence_dir,
            state_dir,
        )
    except (KeyError, ValueError) as error:
        return _error_result(role, config, review_round_spent, str(error))


def follow_up(
    manifest: Mapping[str, Any],
    role: str,
    identifier: str,
    task: str,
    review_round_spent: Any,
    *,
    workspace: Path | None = None,
    evidence_dir: Path | None = None,
    state_dir: Path | None = None,
) -> dict[str, Any]:
    config = _role_config(manifest, role)
    if config is None:
        return _error_result(role, None, review_round_spent, f"role {role!r} is missing from manifest")
    if (
        (manifest.get("adapter") != "codex" and role != "independent_review")
        or config.get("launcher") != "codex"
        or config.get("runtime") != "codex"
    ):
        return _error_result(
            role,
            config,
            review_round_spent,
            "manifest runtime/launcher does not belong to Codex adapter",
        )
    try:
        return _run(
            role,
            task,
            review_round_spent,
            config,
            workspace or Path.cwd(),
            evidence_dir,
            state_dir,
            follow_up_identifier=identifier,
        )
    except (KeyError, ValueError) as error:
        return _error_result(role, config, review_round_spent, str(error))
