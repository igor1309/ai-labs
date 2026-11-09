#!/usr/bin/env python3
"""Audit Codex local rollout JSONL (compatibility wrapper).

Equivalent to `sessions-audit codex`; `--home` is the old name for
`--codex-home`. `--json` emits the sessions-audit JSON schema v1.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sessions_audit_core as core  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", dest="codex_home", type=Path, default=core.default_codex_home(), help="CODEX_HOME")
    parser.add_argument("--active-only", action="store_true", help="Skip archived_sessions")
    core.add_common_args(parser)
    args = parser.parse_args(argv)
    return core.execute(parser, args, ["codex"])


if __name__ == "__main__":
    raise SystemExit(main())
