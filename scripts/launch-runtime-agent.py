#!/usr/bin/env python3
"""Dispatch one canonical runtime launch to its selected CLI adapter."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any


LAUNCHER_ROOT = Path(__file__).resolve().parent / "launchers"
RESULT_FIELDS = {
    "role",
    "runtime",
    "requested_model",
    "requested_effort",
    "status",
    "runtime_task_or_agent_id",
    "adapter_error",
    "review_round_spent",
}
SUPPORTED_ADAPTERS = {"claude", "codex"}


def _role_config(manifest: Mapping[str, Any], role: str) -> Mapping[str, Any] | None:
    roles = manifest.get("roles")
    if isinstance(roles, Mapping) and isinstance(roles.get(role), Mapping):
        return roles[role]
    if role in ("independent_review", "independent-review"):
        independent_review = manifest.get("independent_review")
        if isinstance(independent_review, Mapping):
            return independent_review
    return None


def _rejected(
    role: str,
    config: Mapping[str, Any] | None,
    review_round_spent: Any,
    error: str,
) -> dict[str, Any]:
    return {
        "role": role,
        "runtime": config.get("runtime") if config else None,
        "requested_model": config.get("model") if config else None,
        "requested_effort": config.get("reasoning_effort") if config else None,
        "status": "rejected",
        "runtime_task_or_agent_id": None,
        "adapter_error": error,
        "review_round_spent": review_round_spent,
    }


def _load_adapter(name: str):
    path = LAUNCHER_ROOT / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"adversarial_cycle_launcher_{name}", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load launcher adapter {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _validate_result(
    result: Any,
    manifest: Mapping[str, Any],
    role: str,
    config: Mapping[str, Any],
    review_round_spent: Any,
) -> dict[str, Any]:
    if not isinstance(result, Mapping) or set(result) != RESULT_FIELDS:
        return _rejected(
            role,
            config,
            review_round_spent,
            "adapter returned a result outside the canonical launch-result contract",
        )
    canonical = dict(result)
    if canonical["role"] != role:
        return _rejected(role, config, review_round_spent, "adapter changed the requested role")
    if canonical["requested_model"] != config.get("model"):
        return _rejected(role, config, review_round_spent, "adapter changed the requested model")
    if canonical["requested_effort"] != config.get("reasoning_effort"):
        return _rejected(role, config, review_round_spent, "adapter changed the requested effort")
    if canonical["review_round_spent"] != review_round_spent:
        return _rejected(role, config, review_round_spent, "adapter changed review_round_spent")
    if canonical["status"] not in ("accepted", "rejected"):
        return _rejected(role, config, review_round_spent, "adapter returned an invalid status")
    if canonical["status"] == "accepted":
        if canonical["runtime_task_or_agent_id"] is None or canonical["adapter_error"] is not None:
            return _rejected(role, config, review_round_spent, "accepted result violated identifier/error contract")
    elif canonical["runtime_task_or_agent_id"] is not None or canonical["adapter_error"] is None:
        return _rejected(role, config, review_round_spent, "rejected result violated identifier/error contract")
    if canonical["runtime"] != config.get("runtime"):
        return _rejected(role, config, review_round_spent, "adapter changed the selected runtime")
    return canonical


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
        return _rejected(role, None, review_round_spent, f"role {role!r} is missing from manifest")
    adapter = config.get("launcher")
    if adapter not in SUPPORTED_ADAPTERS:
        return _rejected(role, config, review_round_spent, f"unsupported launcher adapter: {adapter!r}")
    if manifest.get("adapter") != adapter and role != "independent_review":
        return _rejected(role, config, review_round_spent, "manifest adapter does not match requested role")
    try:
        module = _load_adapter(adapter)
    except RuntimeError as error:
        return _rejected(role, config, review_round_spent, str(error))
    result = module.launch(
        manifest,
        role,
        task,
        review_round_spent,
        workspace=workspace,
        evidence_dir=evidence_dir,
        state_dir=state_dir,
    )
    return _validate_result(result, manifest, role, config, review_round_spent)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--role", required=True)
    parser.add_argument("--task", required=True)
    parser.add_argument("--review-round-spent", required=True, type=int)
    parser.add_argument("--workspace", default=".")
    parser.add_argument("--evidence-dir")
    parser.add_argument("--state-dir")
    arguments = parser.parse_args(argv)
    try:
        manifest_path = Path(arguments.manifest)
        manifest = json.loads(manifest_path.read_text())
        result = launch(
            manifest,
            arguments.role,
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
    except (OSError, json.JSONDecodeError, TypeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "accepted" else 1


if __name__ == "__main__":
    raise SystemExit(main())
