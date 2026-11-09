#!/usr/bin/env python3
"""Audit Claude Code session transcripts (compatibility wrapper).

Equivalent to `sessions-audit claude`; `--root` is the old name for
`--claude-root`. `--json` emits the sessions-audit JSON schema v1.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sessions_audit_core as core  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", dest="claude_root", type=Path, default=core.default_claude_root(), help="Claude projects/transcript root")
    core.add_common_args(parser)
    args = parser.parse_args(argv)
    return core.execute(parser, args, ["claude"])


if __name__ == "__main__":
    raise SystemExit(main())
