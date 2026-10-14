# LAB-84 question 1

## Who asked

The orchestrator, before writing LAB-84's goal: the issue's done gate asks
an ADR to decide this, and the choice is the owner's.

## Question

Multica LAB-84: `agister install <dir>` reports a folder's `skills/` as not
settings (ADR-016 rule 1, ADR-021 non-decisions), so a settings skill
reaches `~/.agister/skills` only by hand. Home's prompts are copied by hand
from `ai-labs/prompts` (a general prompt library that also holds prompts
that are not Agister settings), and the copies drift: today
`~/.agister/prompts/advisor.md` and `code-review-clarity.md` differ from
`ai-labs/prompts/`. Done when an ADR decides how settings skills and
home's prompts get from their source in git into home, and `install` or a
documented step does it, so home and source cannot differ unseen.

Read ADR-016, ADR-021, `agister/internal/app/` install code, this
repository's `.agister/` and `prompts/`, and `~/.agister/`.

What should the ADR decide? Give the options you see, among them at least:
(a) `install` learns skills (`skills/<name>/SKILL.md` as a document), and
home's global settings get one source folder in git (for example a
`home/` settings folder in this repository holding the global prompts,
skills and the rest), installed with `agister install`; `ai-labs/prompts`
stops being the source of home's copies;
(b) `install` learns skills only, and home's prompts keep `ai-labs/prompts`
as their source through a documented copy step;
(c) something that shows drift instead (for example `check` comparing a
home document with a recorded source).
For each: what it changes, its cost, and what stays able to drift. Then
recommend one, and say which choices in it are the owner's.
