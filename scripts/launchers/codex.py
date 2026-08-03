"""Codex adapter for the runtime-neutral adversarial-cycle launcher."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Callable


NativeLaunch = Callable[..., Any]


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


def _accepted_or_rejected(
    role: str,
    config: Mapping[str, Any],
    review_round_spent: Any,
    native_result: Any,
) -> dict[str, Any]:
    base = {
        "role": role,
        "runtime": config["runtime"],
        "requested_model": config["model"],
        "requested_effort": config["reasoning_effort"],
        "review_round_spent": review_round_spent,
    }
    if isinstance(native_result, Mapping):
        status = native_result.get("status")
        error = native_result.get("adapter_error", native_result.get("error"))
        identifier = native_result.get("runtime_task_or_agent_id")
        if identifier is None:
            identifier = native_result.get("agent_id", native_result.get("id"))
        if status == "rejected" or error is not None:
            return {
                **base,
                "status": "rejected",
                "runtime_task_or_agent_id": None,
                "adapter_error": error if error is not None else "native launch rejected",
            }
        if status != "accepted":
            return {
                **base,
                "status": "rejected",
                "runtime_task_or_agent_id": None,
                "adapter_error": "native launch returned an invalid status",
            }
        if identifier is None:
            return {
                **base,
                "status": "rejected",
                "runtime_task_or_agent_id": None,
                "adapter_error": "native launch returned no agent identifier",
            }
        return {
            **base,
            "status": "accepted",
            "runtime_task_or_agent_id": identifier,
            "adapter_error": None,
        }
    if isinstance(native_result, str) and native_result:
        return {
            **base,
            "status": "accepted",
            "runtime_task_or_agent_id": native_result,
            "adapter_error": None,
        }
    return {
        **base,
        "status": "rejected",
        "runtime_task_or_agent_id": None,
        "adapter_error": "native launch returned no agent identifier",
    }


def _missing_native_launch(**_: Any) -> Any:
    raise RuntimeError("native Codex subagent primitive is not configured")


def launch(
    manifest: Mapping[str, Any],
    role: str,
    task: str,
    review_round_spent: Any,
    native_launch: NativeLaunch | None = None,
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
    primitive = native_launch or _missing_native_launch
    arguments = {
        "model": config["model"],
        "reasoning_effort": config["reasoning_effort"],
        "prompt": task,
        "role": role,
    }
    if config["context_mode"] == "cold":
        arguments["fork_turns"] = "none"
    try:
        native_result = primitive(**arguments)
    except Exception as error:  # Native adapter errors are normalized verbatim once.
        return _error_result(role, config, review_round_spent, str(error))
    return _accepted_or_rejected(role, config, review_round_spent, native_result)
