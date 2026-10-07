# ADR-027: Home's settings have one source in git

- **Status:** Proposed
- **Date:** 2026-10-07
- **Scope:** where the documents of Agister's home settings are kept in
  git, how they reach home, and how `agister install` takes a skill
- **Decision type:** Architecture
- **Amends:** [ADR-016](016-settings-are-installed-into-home-with-a-backup.md)
  rule 1 (a skill is installed) and
  [ADR-021](021-settings-give-an-agent-its-skills.md)'s non-decision on
  `agister install` of skills
- **Relates to:** [ADR-010](010-a-process-names-its-verification.md),
  [ADR-014](014-prompts-are-settings.md),
  [ADR-018](018-a-repository-blocks-what-home-allows.md) rule 6,
  [ADR-019](019-a-prompt-may-be-optional.md)
- **Source:** LAB-84; advisor run `20261007T182802Z-562aca`; the owner's
  choice of option (a), 2026-10-07; the owner's decision on this ADR as
  proposed (adr_review `20261007T183934Z-6c7c05`), 2026-10-07: keep the
  `.agister/` copies; the inventory of home and `.agister/` it rests on,
  `agister/testdata/briefs/lab-84-inventory.md`

## Context

Home's settings (`~/.agister`) are copied by hand from this repository:
its prompts from `prompts/`, a general prompt library that also holds
prompts that are not settings, and its other documents from the
repository's `.agister/`, which keeps its own copies of the same
documents. Settings copied by hand drift apart, and nothing shows when
they do: a change made in one copy is missing from the others, and no
step compares them.

A process that reads its prompt as a `source: file` input names where
that file is. An absolute path ties a global process to one machine
(ADR-014's context); a path relative to the caller ties it to one
repository. Either way the process is global in name only.

A settings skill cannot reach home except by hand: `agister install
<dir>` reports a folder's `skills/` as not settings (ADR-016 rule 1,
ADR-021's non-decisions).

[ADR-016](016-settings-are-installed-into-home-with-a-backup.md) already
installs a folder of settings into home with a plan, a diff, a staged
check, a backup and a restore. What is missing is a folder that is
home's source, and an `install` that takes skills.

## Decision drivers

- Each of home's settings documents has one source, in git.
- A difference between home and its source shows, with its diff, before
  it is written.
- Nothing in the source holds a path of one machine.
- This repository works without home installed.
- A document that this repository shares with the source differs from it
  only where the difference is listed with its reason.
- A skill reaches home the way every other settings document does.

## Decision

`agister/home/` in this repository is the source of home's settings. It
is laid out like home's settings and installed with `agister install
agister/home`, which learns skills. It names no path of a machine: its
processes take their prompts as settings prompts. The prompts home uses
move into it from `prompts/`. The repository's `.agister/` keeps its full
settings, its processes taking the same prompts as settings prompts, and
a test keeps every document it shares with the folder identical, except
those listed with their reason.

## Rules

### 1. The folder is `agister/home/`

`agister/home/` holds settings documents laid out as a settings layer
(`agents/`, `processes/`, `prompts/`, `skills/<name>/SKILL.md`, …) and
nothing else. It sits beside the binary whose tests check it (rule 7).
It is not the example settings that `agister init` installs
(`agister/examples/settings/`): those are for anyone, and the folder is
this owner's home.

### 2. It holds every global settings document home uses

It starts with every settings document home holds today, and so with
`runtimes/claude-code.yaml` and `service.toml`. Where home and `.agister/`
differ, it takes the current one:

- the eight review, judge and advisor processes, with their prompts
  taken as settings prompts (rule 4), and otherwise the text they share;
  `advisor.yaml`'s header comment is home's generic one;
- the four `implement*` processes as `.agister/` has them: the ADR-025
  instruction and the two Go prompts as optional inputs, which a
  repository without them runs without (ADR-019);
- `schemas/advice.json` and `service.toml` as home has them;
- the eight prompts of rule 5, with home's `advisor.md` and the
  repository's `code-review-clarity.md`.

It starts with no skill: none exists yet. A settings skill that home
should give is added under `agister/home/skills/`.

### 3. Home keeps what is home's alone

The folder never holds live state: `runs/`, `logs/`, `locks/`,
`backups/`, `cache/`, a runtime's sessions such as `pi/`, or a lock file.
Install never touches them (ADR-016 rule 1). It holds no `blocks.yaml`,
which home has none of (ADR-018 rule 6), and no verification: that is a
slot a repository fills (ADR-010).

A document that holds what only one machine has, such as an agent whose
`command` is a path of this machine, stays in home alone and is not put
into the folder. None does today. A document only home has is kept by
every install and listed in its plan (ADR-016 rules 2 and 8).

### 4. No process names a prompt by path

A process of the folder gives a fixed text as a settings prompt,
`{source: prompt, name: <name>}` (ADR-014), never as a `source: file`
input. `source: file` is left for what the caller names, a param; a
folder process fixes no file path, absolute or relative.

`.agister/`'s processes take their prompts the same way, so each can be
identical to the folder's. Their prompts are found as any prompt is, the
project's before the global one (ADR-014): `.agister/` holds its copies
of the eight prompts in `.agister/prompts/<name>.md`, so this
repository's runs take them from `.agister/` with or without home
installed.

### 5. The prompts home uses move out of `prompts/`

The eight prompts home's processes use, `advisor.md` and
`code-review-{adr,adversarial,architecture,clarity,intent,judge,tests}.md`,
move with their history from `prompts/` to `agister/home/prompts/` and
leave `prompts/`. `prompts/` stops being the source of any of home's
documents; it stays the general prompt library, with its other prompts.
The eight prompts' copies in `.agister/prompts/` (rule 4) are kept by
the test of rule 6.
`prompts/go-architecture.md` and `prompts/go-testing-seams.md` stay where
they are, with their copies in `.agister/prompts/` that a test keeps
identical: they are this repository's, not home's.

### 6. `.agister/` keeps its full settings, identical where shared

The repository's `.agister/` keeps every settings document its runs use,
so this repository works without home installed. Beside the documents
only it has (`verifies/repo.yaml` and the two Go prompts), every document
it holds is one the folder also holds, by kind and name, the eight
prompts included (rule 4).

A repository test fails when a document `.agister/` shares with the
folder differs from the folder's, unless the test lists it with its
reason. The list starts with this repository's wording, which names
`agister/docs/decisions.md` where the folder's is generic:
`prompts/advisor.md` and `schemas/advice.json`. Every other shared
document takes the folder's text, `processes/advisor.yaml`'s header
comment and `service.toml` included. A document the repository later
wants to differ from home's is listed the same way, so no project copy
replaces home's unseen.

### 7. A repository test keeps the folder installable

A test of this repository installs `agister/home/` with this binary into
an empty temporary home and runs `check` on it as global settings, with
no project settings: a problem fails it. It also fails when a folder
process takes a `source: file` input with a fixed path (rule 4), and when
a document `.agister/` shares with the folder differs from it without
being listed with its reason (rule 6). The repository tests that run this
repository's processes take home's settings from the folder.

### 8. Install takes a skill as it takes any document

`install` reads a source folder's `skills/` (amending ADR-016 rule 1). A
skill, `skills/<name>/SKILL.md` (ADR-021 rule 1), is one settings
document: it is planned as create, replace or unchanged, its replace
shows a diff, it is staged and checked with the rest, its replace is
backed up, and it is written atomically, as any document is (ADR-016
rules 2 to 5). Home's skills are staged as home has them, so the staged
check sees what home will hold. Restore puts back a replaced `SKILL.md`,
and removes a created one together with its folder when that folder is
then empty (ADR-016 rule 6).

### 9. A skill folder that is not a skill refuses the install

A source skill folder holding anything beside `SKILL.md`, or whose
`SKILL.md` is not a regular file, is a problem of that skill, as ADR-021
rule 1 has it. It refuses the install, as any problem does (ADR-016
rule 3), and names the skill and the files beside its `SKILL.md`. A file
directly under `skills/` is not a settings document: it is reported and
not installed, as any other such file is (ADR-016 rule 1). A symbolic
link still refuses the whole folder.

### 10. Home and the folder differ only in the open

Home is brought to the folder by `agister install agister/home` from the
main checkout, after a change to the folder merges and the binary that
checks it is installed. Any difference between home and the folder is
then a replace, with its diff, in that install's plan, or a document only
home has, listed and kept. Nothing else compares them.

## Amendments

- **ADR-016 rule 1:** the installed files are the settings documents
  Agister knows, skills included (rules 8 and 9). A source's `blocks.yaml`
  is still named and not installed.
- **ADR-021, explicit non-decisions:** `agister install` of skills is
  decided here; a source's `skills/` is no longer reported as not
  settings. Skills with files beside `SKILL.md` remain a non-decision.

## Consequences

- A change to home's settings is a reviewed change in git, and reaches
  home only through an install's plan, diff, check and backup.
- Home's processes find their prompts on any machine and in any
  repository: no path of a machine or a repository is left in them. A
  process that names a verification, as the `implement*` processes name
  `verify:repo`, still runs only in a repository that fills that slot:
  the folder holds no verification (rule 3), and a call whose named
  verification is in neither layer is refused (ADR-010 rule 4). A
  passing `check` of the folder (rule 7) does not show that such a
  process runs in a given repository.
- Until the owner installs the folder after the merge, home keeps its
  hand copies, which other repositories' runs use; this repository's runs
  take `.agister/`'s documents, installed or not.
- A change to a shared document is made in the folder and in `.agister/`
  together; the test of rule 6 fails until both match or the difference
  is listed.
- A settings field adopted in `agister/home/` cannot reach home before
  the binary that knows it: the install's staged check refuses it. The
  LAB-122 hazard of `agister/AGENTS.md` stays as it is: a shared document
  adopts a new field in the folder and in `.agister/` together, in the
  change's last commit.
- `agister/AGENTS.md`'s step "update the home settings under `~/.agister`
  to match what it ships" becomes installing the folder.
- The repository tests that read `prompts/code-review-*.md` and
  `prompts/advisor.md` read them from the folder; the CI path filter on
  `prompts/code-review-*.md` (`.github/workflows/ci.yml` and its test)
  is covered by `agister/**` instead.
- Home can still be edited by hand; the next install shows the edit as a
  replace and undoes it on yes.

## Alternatives considered

- **Install the repository's `.agister/` as home.** Rejected: it holds
  what the repository means only for itself (`verifies/repo.yaml`, the
  Go prompts, ai-labs wording in `advisor.md` and `advice.json`), which
  would become global (ADR-016's consequences); and today its processes
  name prompts by a path relative to this repository.
- **`install` learns skills only; home's prompts stay copied from
  `prompts/` by a documented step** (the advisor's option b). Rejected by
  the owner: the copy step is the hand copy that drifted.
- **Show drift instead of preventing it** (`check` comparing a home
  document with a recorded source; option c). Rejected by the owner: a
  difference is still made by hand, and only reported afterwards.
- **`.agister/` keeps only what is the repository's own** (today
  `verifies/repo.yaml` and the two Go prompts), every other document
  removed from it and this repository's runs taking them from home, with
  one copy of each document and each change made once. Rejected by the
  owner: the repository must work without home installed.
- **The folder at the repository root (`home/`).** Rejected: a generic
  name in a repository of many projects, away from the binary whose
  tests check it.

## Explicit non-decisions

Installing into home, which the owner runs after the merge; pruning
documents only home has (ADR-016's non-decision); skills with files
beside `SKILL.md` (ADR-021's non-decision); the settings of other
machines or owners; moving the Go prompts' source from `prompts/` into
`.agister/prompts/`.
