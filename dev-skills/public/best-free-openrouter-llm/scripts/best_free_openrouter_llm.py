#!/usr/bin/env python3

import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

RANKING_URL = "https://shir-man.com/api/free-llm/top-models"
CONFIDENCE_ORDER = {
    "low": 0,
    "medium": 1,
    "high": 2,
}


@dataclass(frozen=True)
class Selection:
    model: str
    model_name: str | None
    base_url: str
    fallback_model: str
    updated_at: str | None
    ranking_version: str | None
    ranking_confidence: str | None
    reason: str | None
    score: int | None
    latency_ms: int | None
    context_length: int | None


def fetch_json(url: str, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "best-free-openrouter-llm-skill/1.0"},
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"ranking endpoint returned HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"ranking endpoint unavailable: {error.reason}") from error
    except TimeoutError as error:
        raise RuntimeError("ranking endpoint timed out") from error

    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError as error:
        raise RuntimeError("ranking endpoint returned invalid JSON") from error

    if not isinstance(decoded, dict):
        raise RuntimeError("ranking endpoint returned unexpected JSON shape")

    return decoded


def select_model(data: dict[str, Any], min_confidence: str) -> Selection:
    models = data.get("models")
    if not isinstance(models, list) or not models:
        raise RuntimeError("ranking endpoint returned no models")

    confidence = data.get("rankingConfidence")
    required = CONFIDENCE_ORDER[min_confidence]
    if not isinstance(confidence, str):
        raise RuntimeError("ranking confidence is missing")

    current = CONFIDENCE_ORDER.get(confidence, -1)
    if current < required:
        raise RuntimeError(f"ranking confidence '{confidence}' is below required '{min_confidence}'")

    primary = models[0]
    if not isinstance(primary, dict):
        raise RuntimeError("top-ranked model has unexpected shape")

    model_id = primary.get("id")
    if not isinstance(model_id, str) or not model_id:
        raise RuntimeError("top-ranked model is missing id")

    base_url = data.get("baseUrl")
    if not isinstance(base_url, str) or not base_url:
        base_url = "https://openrouter.ai/api/v1"

    fallback = data.get("fallback")
    fallback_model = "openrouter/free"
    if isinstance(fallback, dict) and isinstance(fallback.get("id"), str):
        fallback_model = fallback["id"]

    return Selection(
        model=model_id,
        model_name=primary.get("name") if isinstance(primary.get("name"), str) else None,
        base_url=base_url,
        fallback_model=fallback_model,
        updated_at=data.get("updatedAt") if isinstance(data.get("updatedAt"), str) else None,
        ranking_version=data.get("rankingVersion") if isinstance(data.get("rankingVersion"), str) else None,
        ranking_confidence=confidence if isinstance(confidence, str) else None,
        reason=primary.get("reason") if isinstance(primary.get("reason"), str) else None,
        score=primary.get("score") if isinstance(primary.get("score"), int) else None,
        latency_ms=primary.get("latencyMs") if isinstance(primary.get("latencyMs"), int) else None,
        context_length=primary.get("contextLength") if isinstance(primary.get("contextLength"), int) else None,
    )


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def print_env(selection: Selection, include_fallback: bool) -> None:
    print(f"export OPENROUTER_BASE_URL={shell_quote(selection.base_url)}")
    print(f"export OPENROUTER_MODEL={shell_quote(selection.model)}")
    if include_fallback:
        print(f"export OPENROUTER_FALLBACK_MODEL={shell_quote(selection.fallback_model)}")


def print_text(selection: Selection, include_fallback: bool) -> None:
    print(f"model: {selection.model}")
    print(f"base_url: {selection.base_url}")
    if selection.model_name:
        print(f"name: {selection.model_name}")
    if include_fallback:
        print(f"fallback_model: {selection.fallback_model}")
    if selection.ranking_confidence:
        print(f"ranking_confidence: {selection.ranking_confidence}")
    if selection.reason:
        print(f"reason: {selection.reason}")
    if selection.updated_at:
        print(f"updated_at: {selection.updated_at}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Select the current best free OpenRouter model.")
    parser.add_argument("--url", default=RANKING_URL, help="ranking endpoint URL")
    parser.add_argument("--timeout", type=float, default=10.0, help="HTTP timeout in seconds")
    parser.add_argument("--min-confidence", choices=sorted(CONFIDENCE_ORDER), default="medium")
    parser.add_argument("--json", action="store_true", help="print JSON output")
    parser.add_argument("--env", action="store_true", help="print shell exports")
    parser.add_argument("--no-fallback", action="store_true", help="omit fallback model from text/env output")
    args = parser.parse_args()

    try:
        data = fetch_json(args.url, args.timeout)
        selection = select_model(data, args.min_confidence)
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(selection.__dict__, indent=2, sort_keys=True))
    elif args.env:
        print_env(selection, not args.no_fallback)
    else:
        print_text(selection, not args.no_fallback)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
