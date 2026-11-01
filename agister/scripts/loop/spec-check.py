"""spec-check.py <root> <notes> <feature>...: what spec-check.sh reports.
Prose of the notes over 76 columns, of a feature over 80; tables, code
blocks, front matter and titles, which cannot wrap, are not prose. A feature over 90 lines warns,
over 100 fails. Every backlog/<name>.md named is a file under root."""
import os
import re
import sys

root, notes, features = sys.argv[1], sys.argv[2], sys.argv[3:]
reports = []


def prose(path, width):
    fence = front = False
    for n, line in enumerate(open(path).read().split("\n"), 1):
        if n == 1 and line == "---":
            front = True
            continue
        if front:
            front = line != "---"
            continue
        if line.lstrip().startswith("```"):
            fence = not fence
            continue
        if fence or line.lstrip().startswith(("|", "Feature:", "Scenario", "Rule:")):
            continue
        if len(line) > width:
            reports.append(f"{path}:{n}: {len(line)} columns, over {width}")


prose(notes, 76)
for f in features:
    prose(f, 80)
    lines = len(open(f).read().rstrip("\n").split("\n"))
    if lines > 100:
        reports.append(f"{f}: {lines} lines, over the hook's 100")
    elif lines > 90:
        print(f"warning: {f}: {lines} lines, near the hook's 100")
for path in [notes] + features:
    for n, line in enumerate(open(path), 1):
        for name in re.findall(r"backlog/[\w.-]+\.md", line):
            if not os.path.exists(os.path.join(root, name)):
                reports.append(f"{path}:{n}: {name} is not there")
for r in reports:
    print(r)
print("spec check: " + (f"{len(reports)} reported" if reports else "clean"))
sys.exit(1 if reports else 0)
