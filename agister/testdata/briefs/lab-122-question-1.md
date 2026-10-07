# LAB-122 question 1

## Who asked

The agent taking Multica issue LAB-122 ("Agister: a change to the
project's settings stops the installed binary that develops it"), whose
Done when allows either of two fixes.

## Question

Question: how should LAB-122 be closed? Today the installed binary reads
the worktree's `.agister/`, so a branch that adds a settings field and
uses it there is refused by that binary for every later run on the
branch (observed in LAB-119). Option A: a rule in `agister/AGENTS.md`
that such an adoption lands in the change's last commit (or after the
deploy), with a test in this repository that holds the rule. Option B:
Agister reads settings so an older binary keeps working on such a
branch, for example an option or environment variable that names
another directory for the project settings (such as trunk's checkout),
with its tests, CLI help, SKILL.md and README. Option C: the binary,
on refusing project settings, names a field it does not know and says
the settings may be newer than the binary, together with Option A's
rule.
