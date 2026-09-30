#!/usr/bin/env python3
"""Bundle the outputs of Agister review runs for the review judge.

Usage: scripts/review-bundle.py [--home DIR] <run-id>... > reviews.json

Each review is the run's recorded output, unchanged, labelled with the
review process and run ID. Nothing else reaches the judge.
"""

import argparse
import json
import os
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--home", default=os.environ.get("AGISTER_HOME", str(Path.home() / ".agister")))
    parser.add_argument("runs", nargs="+", metavar="run-id")
    args = parser.parse_args()

    reviews = []
    for index, run_id in enumerate(args.runs, 1):
        path = Path(args.home) / "runs" / run_id / "record.json"
        try:
            record = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as err:
            print(f"review-bundle: {path}: {err}", file=sys.stderr)
            return 1
        result = record.get("result") or {}
        if result.get("status") != "completed" or "output" not in result:
            print(f"review-bundle: run {run_id} did not complete with output", file=sys.stderr)
            return 1
        reviews.append({
            "review": index,
            "reviewer": record.get("process", ""),
            "run": run_id,
            "output": result["output"],
        })
    json.dump({"reviews": reviews}, sys.stdout, indent=2, ensure_ascii=False)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
