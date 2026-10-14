# The caller skill states only what the binary owns (LAB-65)

`agister/skills/agister/SKILL.md` describes the owner's current home
settings as if they were Agister: process and workflow names
(`implement` and variants, `code_review`, `adr_review`, `advisor`), their
params (`brief`, `candidate`, `base`) and defaults, `verify:repo` as the
name processes use, the judge's fields, severities and rulings, and a
copy of a verify document. A home set up by `agister init` has none of
them, and any change to home's settings makes the skill wrong unseen.
Rewrite the skill so that it holds only what the `agister` binary owns,
and teaches the caller to discover the rest from the settings it runs
against.

## Keep (facts of the binary; check each against the code)

- what Agister is, where home is (`--home`, `$AGISTER_HOME`, default),
  that a repository's `.agister/` overrides home document by document,
  and that `agister --help` is authoritative;
- discovering what the settings provide: `agister process list`,
  `agister workflow list`, `agister process show <name>` and
  `agister workflow show <name>`, and what `show` tells a caller (a
  process's params and their defaults, its verification, its output
  schema, the tools its agent gets, a workflow's nodes); `agister check`.
  Describe these generically, not by line labels of the current output
  unless the code defines them as a stable format;
- that a process may name a verification document and that a call is
  refused when the document it names is missing; that `show` names it;
  that `agister init` installs example settings, including an example
  verify document, which a repository can start from. Do not carry a
  verify document's YAML;
- running: `agister run <process|workflow> --param k=v`, revision params
  and defaults resolving in the directory you launch from (launch from
  the repository, pin revisions), committing what the call relies on
  because a checkout holds only tracked files, `--json`, `--continue`
  and what it carries, `--max-cost`, `--agent`;
- reading results: `agister runs list|show|watch`, the run record's
  layout, `<home>/runs/<run-id>/artifacts/changes.patch`, `NO_CHANGES`,
  applying the patch with `git apply`, the latest patch being cumulative;
- exit codes;
- the rules that hold whatever the settings: never weaken a check to make
  verification pass; a repository's `.agister/` runs its commands, so
  review settings you did not write; change home with `agister install`,
  not by hand for one repository.

## Drop

- every process, workflow, param, verify or schema name taken from the
  owner's settings, and the judge's fields, severities and rulings and
  what to do for each. Where an example helps, use a placeholder
  (`<process>`, `<param>`) or say "for example, a process named
  `implement` in the example settings" only if `agister init`'s
  examples really have it (check `examples/settings/`);
- the "Set up a repository" steps that copy settings content; keep a
  short section on what a repository provides (its own `.agister/`
  documents, an `AGENTS.md` the runtime loads), pointing to `agister
  init`'s examples and to `agister check`.

The description in the front matter must still say when to use the
skill, without naming the owner's processes.

The caller-skill guard test must still pass; if the skill no longer
names a command or flag a guard case relies on, adjust only the test's
fixture inputs, not what the guard checks.

Done when the repository's verify command passes. List every file you
changed.
