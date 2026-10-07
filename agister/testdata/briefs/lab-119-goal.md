# LAB-119: brief templates in settings, and a structural check at the entry

## Intent

ADR-026 rules 3, 4, 5 and 8
(`agister/docs/adr/026-the-brief-is-a-runs-input-contract.md`): a goal
and a step brief have named parts; their headings and templates are
settings, not code; a structural check at the entry refuses a brief that
does not have them. Agister checks a brief's structure, never its meaning.

## Done when

1. **A settings kind for briefs.** `briefs/<name>.yaml` defines a brief's
   form: its parts in order, each with its heading, whether it is
   required, and for `Open` the exact text it must read (`None.`). The
   definition also holds the template a caller copies, so the rule and the
   template live in one place. It loads, validates and shows like the
   other settings kinds (`agister show`, or what the kind's peers use), and
   project settings override the home ones as for other kinds.
2. **Two definitions** following ADR-026: `goal` (Intent, Done when,
   Expected behaviour, Out of scope, Sources, Decisions, Open; required
   as rule 3 says) and `step` (Goal, Covers, Acts on, Constraints, Open;
   required as rule 4 says). They ship in `agister/examples/settings/briefs/`
   and in this repository's `.agister/briefs/`.
3. **The check.** A `file` input value may name the forms its text must
   have, e.g. `brief: {source: file, path: ..., form: [goal, step]}`; the
   text passes when it has one of them. A text fails when a required part
   is missing or empty, or `Open` does not read exactly as defined. A
   failure refuses the call before it starts (as other contract checks do,
   with their exit code) and names the input, the form and each missing or
   wrong part. A value with no `form` is not checked, as today.
4. **References resolve.** A part may say it holds a reference to a
   file; then its first back-quoted path, relative to the caller's
   directory, must exist. The step brief's `Goal` part says so. Other
   references (issues, runs) are not checked.
5. **Settings validation.** A process or workflow that names a form that
   does not exist is invalid, as a missing prompt or schema is.
6. **This repository uses it.** `.agister/processes/implement.yaml`'s
   `brief` takes `[goal, step]` and `.agister/workflows/code_review.yaml`'s
   `goal` takes `[goal]`. This goal file passes the `goal` form.
7. Regular tests prove 1 to 5 with the existing seams, including: each
   required part missing, an empty part, `Open` not `None.`, a reference
   that does not resolve, a text that passes either form, an unknown form
   in settings, and a value with no `form` left unchecked.
8. The done gates say the same as the binary: the caller skill
   (`agister/skills/agister/SKILL.md`, including how a caller gets the
   templates), `agister/README.md`, `agister/docs/settings-architecture/`
   (a new kind and a new input field) and `agister/pages/` with its tests.
   Say in the notes which needed no change and why.

## Out of scope

- Judging whether a brief is right (an optional caller process, LAB-120).
- The home settings under `~/.agister`: the owner updates them.
- Rewriting the briefs already in `agister/testdata/briefs/`.

## Sources

- Multica LAB-119.
- ADR-026 rules 3, 4, 5 and 8; ADR-001 rules 1 and 2; ADR-014.
- `research/agister/research/brief.md` §7.

## Decisions

None.

## Open

None.
