# LAB-12: ADR-007 accepted; the advisor process

The owner accepted
`agister/docs/adr/007-an-advisor-decides-open-questions.md` with every
recommended choice under "Open for the owner": 1(a), 2(a), 3(a), 4(a),
5(a).

## The ADR

- Status: Accepted.
- Fold the five accepted choices into the decisions they belong to and
  remove the "Open for the owner" section; move each rejected option to
  "Alternatives considered" in a line. No history of how it was decided.

## The mechanism (ADR-007 rule 5), as repository settings

- An `advisor` process in `.agister/processes/`, run as
  `agister run advisor --param question=<file> --param revision=<rev>`:
  the question file as a `file` input, a read-only checkout of the
  revision, a JSON output under a new schema.
- Its agent: Codex, a model family other than the judge's (choice 5a); use
  the existing fresh-only Codex agent in `.agister/agents/`.
- Its policy: read-only, as the Codex reviews have
  (`.agister/policies/codex-review.yaml`), reused if it fits.
- Its prompt in `prompts/`, reusable: draw the build/policy line first
  (ADR-007 rule 1; in doubt, policy); read the ADRs, the `AGENTS.md` files
  and `agister/docs/decisions.md`; do not decide from code; answer `owner`
  with the reason, or a decision with the option chosen, the options
  excluded and why, the recorded decisions it rests on ("none" allowed,
  choice 1a) and the follow-ups.
- Its output schema in `.agister/schemas/`: either the `owner` answer or
  the decision's fields, as ADR-007 rule 2 and 3 name them.
- `agister/docs/decisions.md`: the file with its record format (ADR-007
  rule 3 and 4: `D-<n>`, status `Provisional (advisor)` / `Confirmed` /
  `Owner`, superseding) and no records yet.
- `agister/AGENTS.md`: where it says owner items go to the owner, say:
  write the question file (who asked, the question, the options, nothing
  else), run the advisor, append its decision as a record, list
  provisional records in the pull request description; only an `owner`
  answer goes to the owner.

No core code change (ADR-007 rule 5). If one turns out to be needed, stop
and say so in your notes instead of making it.

## Tests

The repository-settings test (`agister/cmd/agister/repo_settings_test.go`)
runs every repository process on the fake runtimes: the advisor must run
there too, with a question file, and its recorded agent asserted. `agister
check` passes.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
