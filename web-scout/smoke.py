# web-scout/smoke.py
import json
import os

QUERY = "Python programming language"


def run(scout, judge, docker_logs, env=None, print_fn=print):
    if env is None:
        env = os.environ

    if not env.get("SEARXNG_URL"):
        print_fn("FAIL: SEARXNG_URL environment variable is required")
        return 1
    if not env.get("NOMOS_API_KEY"):
        print_fn("FAIL: NOMOS_API_KEY environment variable is required")
        return 1
    if not env.get("NOMOS_BASE_URL"):
        print_fn("FAIL: NOMOS_BASE_URL environment variable is required")
        return 1

    try:
        result = scout(QUERY)
    except Exception:
        print_fn("FAIL: scout agent raised an exception")
        return 1

    if not result or not result.strip():
        print_fn("FAIL: scout agent produced empty output")
        return 1

    try:
        parsed = json.loads(result)
    except (json.JSONDecodeError, ValueError):
        print_fn("FAIL: scout result is not valid JSON")
        return 1

    if not isinstance(parsed.get("results"), list) or len(parsed["results"]) == 0:
        print_fn("FAIL: results array is empty")
        return 1

    for r in parsed["results"]:
        if not r.get("title") or not r.get("url"):
            print_fn("FAIL: result missing non-empty title or url")
            return 1

    try:
        logs = docker_logs()
    except Exception:
        logs = "(unavailable)"

    judge_result = judge(QUERY, result, logs)

    words = (judge_result or "").strip().split()
    first_word = words[0].upper() if words else ""

    if first_word not in ("PASS", "FAIL"):
        print_fn("FAIL: judge verdict unparseable (must start with PASS or FAIL)")
        return 1
    if first_word == "FAIL":
        print_fn(f"FAIL\n{judge_result}")
        return 1

    print_fn(f"PASS\n{judge_result}")
    return 0
