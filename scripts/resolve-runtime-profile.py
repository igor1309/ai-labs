#!/usr/bin/env python3
"""Resolve a skill-owned runtime profile into a canonical execution manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError as error:  # pragma: no cover - Python 3.11+ is required.
    raise SystemExit("Python 3.11 or newer is required for TOML profile parsing") from error


SKILL_ROOT = Path(__file__).resolve().parent.parent
REQUIRED_ROLES = ("planner", "implementer", "reviewer", "escalation")
SUPPORTED_HOSTS = ("claude", "codex")
VALID_CONTEXT_MODES = ("cold", "warm")
VALID_ACCESS_MODES = ("read-only", "workspace-write")


class ProfileError(ValueError):
    """Raised when a runtime profile or caller override violates its contract."""


def _mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProfileError(f"{label} must be a TOML table")
    return value


def _string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ProfileError(f"{label} must be a non-empty string")
    return value


def _canonical_role(value: str) -> str:
    return value.strip().lower().replace("-", "_")


def _profile_path(host: str, requested: str | None) -> Path:
    if requested is None:
        return SKILL_ROOT / "runtime" / f"{host}.toml"
    candidate = Path(requested).expanduser()
    if candidate.is_absolute():
        return candidate
    current_directory_candidate = Path.cwd() / candidate
    if current_directory_candidate.exists():
        return current_directory_candidate
    return SKILL_ROOT / candidate


def _load_profile(host: str, requested: str | None) -> tuple[dict[str, Any], Path, str]:
    path = _profile_path(host, requested)
    try:
        raw_bytes = path.read_bytes()
    except OSError as error:
        raise ProfileError(f"cannot read profile {path}: {error}") from error
    try:
        profile = tomllib.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise ProfileError(f"cannot parse profile {path}: {error}") from error
    return _mapping(profile, "profile"), path, hashlib.sha256(raw_bytes).hexdigest()


def _validate_role(role: str, config: Any) -> dict[str, Any]:
    role_config = _mapping(config, f"roles.{role}")
    _string(role_config.get("model"), f"roles.{role}.model")
    effort = _string(role_config.get("reasoning_effort"), f"roles.{role}.reasoning_effort")
    context_mode = _string(role_config.get("context_mode"), f"roles.{role}.context_mode")
    if context_mode not in VALID_CONTEXT_MODES:
        raise ProfileError(
            f"roles.{role}.context_mode must be one of {', '.join(VALID_CONTEXT_MODES)}"
        )
    access = _string(role_config.get("access"), f"roles.{role}.access")
    if access not in VALID_ACCESS_MODES:
        raise ProfileError(
            f"roles.{role}.access must be one of {', '.join(VALID_ACCESS_MODES)}"
        )
    return {
        "model": role_config["model"],
        "reasoning_effort": effort,
        "context_mode": context_mode,
        "access": access,
    }


def _validate_profile(profile: dict[str, Any], host: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if profile.get("schema_version") != 1:
        raise ProfileError("profile schema_version must be 1")
    runtime = _string(profile.get("runtime"), "profile.runtime")
    launcher = _string(profile.get("launcher"), "profile.launcher")
    executable = _string(profile.get("executable"), "profile.executable")
    if runtime not in SUPPORTED_HOSTS:
        raise ProfileError(f"profile.runtime must be one of {', '.join(SUPPORTED_HOSTS)}")
    if runtime != host:
        raise ProfileError(f"host {host!r} does not match profile runtime {runtime!r}")
    if launcher != runtime:
        raise ProfileError(f"profile.launcher {launcher!r} must match runtime {runtime!r}")
    if profile.get("unavailable_model_policy") != "stop":
        raise ProfileError("profile.unavailable_model_policy must be 'stop'")

    roles = _mapping(profile.get("roles"), "roles")
    missing_roles = [role for role in REQUIRED_ROLES if role not in roles]
    if missing_roles:
        raise ProfileError(f"missing required roles: {', '.join(missing_roles)}")
    validated_roles = {
        role: _validate_role(role, roles[role])
        for role in REQUIRED_ROLES
    }

    independent_review = _mapping(profile.get("independent_review"), "independent_review")
    independent_runtime = _string(
        independent_review.get("runtime"), "independent_review.runtime"
    )
    independent_launcher = _string(
        independent_review.get("launcher"), "independent_review.launcher"
    )
    independent_executable = _string(
        independent_review.get("executable"), "independent_review.executable"
    )
    independent_provider = _string(
        independent_review.get("provider"), "independent_review.provider"
    )
    _string(independent_review.get("model"), "independent_review.model")
    independent_effort = _string(
        independent_review.get("reasoning_effort"),
        "independent_review.reasoning_effort",
    )
    independent_context = _string(
        independent_review.get("context_mode"), "independent_review.context_mode"
    )
    independent_access = _string(
        independent_review.get("access"), "independent_review.access"
    )
    classification = _string(
        independent_review.get("classification"), "independent_review.classification"
    )
    if independent_context != "cold":
        raise ProfileError("independent_review.context_mode must be 'cold'")
    if independent_access != "read-only":
        raise ProfileError("independent_review.access must be 'read-only'")
    if independent_launcher not in SUPPORTED_HOSTS:
        raise ProfileError("independent_review.launcher must be a supported runtime")
    if independent_runtime not in SUPPORTED_HOSTS:
        raise ProfileError("independent_review.runtime must be a supported runtime")
    if independent_runtime != independent_launcher:
        raise ProfileError("independent_review.runtime must match its launcher")

    presets = profile.get("presets", {})
    presets = _mapping(presets, "presets")
    validated_presets: dict[str, dict[str, str]] = {}
    for name, value in presets.items():
        preset = _mapping(value, f"presets.{name}")
        validated_presets[name] = {
            "model": _string(preset.get("model"), f"presets.{name}.model"),
            "reasoning_effort": _string(
                preset.get("reasoning_effort"),
                f"presets.{name}.reasoning_effort",
            ),
        }

    validated_independent_review = {
        "runtime": independent_runtime,
        "launcher": independent_launcher,
        "executable": independent_executable,
        "provider": independent_provider,
        "model": independent_review["model"],
        "reasoning_effort": independent_effort,
        "context_mode": independent_context,
        "access": independent_access,
        "classification": classification,
    }
    return validated_roles, {
        "runtime": runtime,
        "launcher": launcher,
        "executable": executable,
        "provider": _string(profile.get("provider"), "profile.provider"),
        "independent_review": validated_independent_review,
        "presets": validated_presets,
    }


def _parse_override(raw_override: str) -> tuple[str, str | None, str]:
    if "=" not in raw_override:
        raise ProfileError(f"override must use key=value: {raw_override!r}")
    key, value = raw_override.split("=", 1)
    key_parts = key.split(".")
    if len(key_parts) == 1:
        role = _canonical_role(key_parts[0])
        field = None
    elif len(key_parts) == 2:
        role = _canonical_role(key_parts[0])
        field = key_parts[1].strip().lower()
    else:
        raise ProfileError(f"override key must be role or role.field: {key!r}")
    if not role or not value:
        raise ProfileError(f"override must contain non-empty role and value: {raw_override!r}")
    if field not in (None, "model", "effort", "reasoning_effort", "preset"):
        raise ProfileError(f"unsupported override field {field!r}")
    return role, field, value


def _record_inline_value(record: dict[str, Any], value: str) -> None:
    chunks = [chunk.strip() for chunk in value.replace(";", ",").split(",") if chunk.strip()]
    if not chunks:
        raise ProfileError("literal override must not be empty")
    if len(chunks) == 1 and ":" not in chunks[0]:
        record["model"] = chunks[0]
        return
    for chunk in chunks:
        if ":" not in chunk:
            raise ProfileError(f"literal override component must use field:value: {chunk!r}")
        field, component = chunk.split(":", 1)
        field = field.strip().lower()
        component = component.strip()
        if field not in ("model", "effort", "reasoning_effort") or not component:
            raise ProfileError(f"unsupported literal override component: {chunk!r}")
        record["effort" if field == "reasoning_effort" else field] = component


def _resolve_overrides(
    base_roles: dict[str, dict[str, Any]],
    independent_review: dict[str, Any],
    presets: dict[str, dict[str, str]],
    raw_overrides: list[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    valid_roles = set(base_roles) | {"independent_review"}
    for raw_override in raw_overrides:
        role, field, value = _parse_override(raw_override)
        if role not in valid_roles:
            raise ProfileError(f"unknown role in override: {role}")
        record = records.setdefault(role, {})
        if field in ("effort", "reasoning_effort"):
            record["effort"] = value
        elif field == "model":
            record["model"] = value
        elif field == "preset":
            record["preset"] = value
        else:
            if value in presets:
                record["preset"] = value
            elif value.startswith("preset:") and value.removeprefix("preset:") in presets:
                record["preset"] = value.removeprefix("preset:")
            else:
                _record_inline_value(record, value)

    resolved_roles: dict[str, dict[str, Any]] = {}
    for role, base in base_roles.items():
        record = records.get(role, {})
        resolved = dict(base)
        if "preset" in record:
            preset_name = record["preset"]
            if preset_name not in presets:
                raise ProfileError(f"unknown preset {preset_name!r} for role {role}")
            preset = presets[preset_name]
            conflicting_fields = [
                field
                for field, preset_value in (
                    ("model", preset["model"]),
                    ("effort", preset["reasoning_effort"]),
                )
                if field in record and record[field] != preset_value
            ]
            if conflicting_fields:
                raise ProfileError(
                    f"conflicting preset fields for {role}: {', '.join(conflicting_fields)}"
                )
            resolved["model"] = preset["model"]
            resolved["reasoning_effort"] = preset["reasoning_effort"]
            resolved["source"] = "caller-preset"
        elif "model" in record or "effort" in record:
            resolved["model"] = record.get("model", resolved["model"])
            resolved["reasoning_effort"] = record.get(
                "effort", resolved["reasoning_effort"]
            )
            resolved["source"] = "caller-literal"
        else:
            resolved["source"] = "profile-default"
        resolved_roles[role] = resolved

    resolved_independent = dict(independent_review)
    record = records.get("independent_review", {})
    if "preset" in record:
        preset_name = record["preset"]
        if preset_name not in presets:
            raise ProfileError(f"unknown preset {preset_name!r} for role independent_review")
        preset = presets[preset_name]
        conflicting_fields = [
            field
            for field, preset_value in (
                ("model", preset["model"]),
                ("effort", preset["reasoning_effort"]),
            )
            if field in record and record[field] != preset_value
        ]
        if conflicting_fields:
            raise ProfileError(
                "conflicting preset fields for independent_review: "
                + ", ".join(conflicting_fields)
            )
        resolved_independent["model"] = preset["model"]
        resolved_independent["reasoning_effort"] = preset["reasoning_effort"]
        resolved_independent["source"] = "caller-preset"
    elif "model" in record or "effort" in record:
        resolved_independent["model"] = record.get("model", resolved_independent["model"])
        resolved_independent["reasoning_effort"] = record.get(
            "effort", resolved_independent["reasoning_effort"]
        )
        resolved_independent["source"] = "caller-literal"
    else:
        resolved_independent["source"] = "profile-default"
    return resolved_roles, resolved_independent


def _manifest(
    host: str,
    profile_path: Path,
    profile_digest: str,
    profile: dict[str, Any],
    roles: dict[str, dict[str, Any]],
    independent_review: dict[str, Any],
    requested_profile: str | None,
) -> dict[str, Any]:
    profile_path_value = (
        str(profile_path)
        if requested_profile is not None
        else f"runtime/{host}.toml"
    )
    manifest_roles: dict[str, dict[str, Any]] = {}
    for role, config in roles.items():
        manifest_roles[role] = {
            "role": role,
            "runtime": profile["runtime"],
            "launcher": profile["launcher"],
            "executable": profile["executable"],
            "provider": profile["provider"],
            "model": config["model"],
            "reasoning_effort": config["reasoning_effort"],
            "context_mode": config["context_mode"],
            "access": config["access"],
            "source": config["source"],
        }
    manifest_independent_review = {
        "role": "independent_review",
        "runtime": independent_review["runtime"],
        "launcher": independent_review["launcher"],
        "executable": independent_review["executable"],
        "provider": independent_review["provider"],
        "model": independent_review["model"],
        "reasoning_effort": independent_review["reasoning_effort"],
        "context_mode": independent_review["context_mode"],
        "access": independent_review["access"],
        "classification": independent_review["classification"],
        "source": independent_review["source"],
    }
    return {
        "schema_version": 1,
        "host": host,
        "runtime": profile["runtime"],
        "adapter": profile["launcher"],
        "profile_path": profile_path_value,
        "profile_digest": profile_digest,
        "unavailable_model_policy": profile["unavailable_model_policy"],
        "roles": manifest_roles,
        "independent_review": manifest_independent_review,
    }


def resolve(host: str, overrides: list[str], requested_profile: str | None = None) -> dict[str, Any]:
    if host not in SUPPORTED_HOSTS:
        raise ProfileError(f"host must be one of {', '.join(SUPPORTED_HOSTS)}")
    profile, profile_path, profile_digest = _load_profile(host, requested_profile)
    base_roles, profile_values = _validate_profile(profile, host)
    roles, independent_review = _resolve_overrides(
        base_roles,
        profile_values["independent_review"],
        profile_values["presets"],
        overrides,
    )
    profile_values["unavailable_model_policy"] = profile["unavailable_model_policy"]
    return _manifest(
        host,
        profile_path,
        profile_digest,
        profile_values,
        roles,
        independent_review,
        requested_profile,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True, choices=SUPPORTED_HOSTS)
    parser.add_argument("--profile")
    parser.add_argument("--set", dest="overrides", action="append", default=[])
    arguments = parser.parse_args(argv)
    try:
        manifest = resolve(arguments.host, arguments.overrides, arguments.profile)
    except ProfileError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(json.dumps(manifest, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
