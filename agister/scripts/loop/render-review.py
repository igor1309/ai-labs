"""render-review.py <review.json> <review.md> <triage.md>: an agister
code_review result, its output "judgement", as markdown, every field of
every item, and a triage skeleton of one row an item, its triage and
reason left to fill. A review that did not complete is reported."""
import json
import sys

src, md, triage = sys.argv[1:4]
run = json.load(open(src))
if run["status"] != "completed":
    sys.exit(f"the review {run['status']}, class {run['class']}: {run['reason']}")
out = run["output"]["judgement"]
cost = "cost unknown" if run["cost"] is None else f"${run['cost']:.2f}"
lines = ["# Branch review", "",
         f"Status {run['status']}; {cost}; {run['timing']['duration_ms'] / 1000:.0f}s.", "",
         "## Summary", "", out["summary"], "",
         "## Coverage gaps", ""]
for gap in out["coverage_gaps"]:
    if isinstance(gap, dict):
        lines.append("- " + "; ".join(f"**{k}:** {v}" for k, v in gap.items()))
    else:
        lines.append(f"- {gap}")
lines += ([] if out["coverage_gaps"] else ["None."]) + [""]
fields = ["sources", "reason", "action", "benefit", "cost", "switching_condition", "missing_evidence"]
for i, item in enumerate(out["items"], 1):
    lines += [f"## {i}. [{item['severity']} / {item['ruling']}] {item['title']}", ""]
    for f in fields:
        value = item.get(f)
        if isinstance(value, list):
            value = ", ".join(value)
        if value:
            lines.append(f"- **{f}:** {value}")
    lines.append("")
open(md, "w").write("\n".join(lines))

rows = ["# Branch review: triage", "",
        "| # | Finding | Judge | Triage | Reason |", "|---|---|---|---|---|"]
for i, item in enumerate(out["items"], 1):
    rows.append(f"| {i} | {item['title']} | {item['ruling']} ({item['severity']}) |  |  |")
open(triage, "w").write("\n".join(rows) + "\n")
