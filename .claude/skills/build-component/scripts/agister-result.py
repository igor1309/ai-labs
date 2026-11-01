#!/usr/bin/env python3
"""Print what matters from an agister run log: its status, then the checks
of an implement run, the findings of a review process, or the judgement of
code_review.

Agister exits 0 when a run fails; only this JSON says so.
"""
import json
import sys

text = open(sys.argv[1]).read()
run = json.loads(text[text.rfind("\n{") + 1 :])
seconds = (run.get("timing") or {}).get("duration_ms", 0) // 1000
print(f"status {run['status']}  class {run.get('class')}  {seconds} s  cost {run.get('cost')}")
if run["status"] != "completed":
    print("reason", run.get("reason"))
    sys.exit(1)

output = run.get("output") or {}
judgement = output.get("judgement")
if judgement is not None:
    for item in judgement.get("items", []):
        print(f"\n[{item.get('ruling')}] {item.get('severity')}: {item.get('title')}")
        for key in ("detail", "action", "rationale"):
            if item.get(key):
                print(f"  {key}: {item[key]}")
    for gap in judgement.get("coverage_gaps", []):
        print(f"\ngap: {gap.get('item')}: {gap.get('detail')}")
    print("\n" + judgement.get("summary", ""))
    sys.exit(0)

result = output.get("output", output)
for check in result.get("verification") or result.get("checks") or []:
    print(f"{check.get('exit_code')}  {check.get('command')}\n     {check.get('final_line')}")
if "verdict" in result:
    print("verdict", result["verdict"])
for finding in result.get("findings", []):
    print(f"\n{finding.get('severity')}: {finding.get('title')} ({finding.get('file')}:{finding.get('line')})")
    print("  " + str(finding.get("detail")))
for key in ("files_changed", "notes", "open", "summary"):
    if result.get(key):
        print(f"\n{key}: {json.dumps(result[key], indent=1, ensure_ascii=False)}")
