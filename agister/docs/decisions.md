# Decisions

The advisor's decisions on open build questions (ADR-007), and the owner's
overrides. Each is a record, appended:

```markdown
## D-<n>: <the question, in a line>

- **Status:** Provisional (advisor) | Confirmed | Owner
- **Supersedes:** D-<m> (only on a record that replaces an earlier one)
- **Asked by:** <who asked; for a judge's item, its workflow run and item>
- **Question:** <the question>
- **Options:** <the options>
- **Excluded:** <each option not chosen, and why>
- **Decision:** <the option chosen>
- **Rests on:** <the recorded decisions it rests on, or "none">
- **Follow-ups:** <what is left to do; one that changes code names the
  test that proves it>
- **Advisor run:** <run ID> (not on an owner's record)
```

- A record is the advisor's output, unedited, numbered from D-1 in the
  order appended.
- Its status is `Provisional (advisor)` until the owner rules. The owner
  confirms it by setting the status to `Confirmed`.
- Records are not edited otherwise. A later decision on the same question
  is a new record that names the one it supersedes; the earlier record
  gains only the line `- **Superseded by:** D-<n>`.
- The owner overrides with a superseding record whose status is `Owner`.
  An owner's record is superseded only by the owner.
- An `owner` answer leaves no record.

No records yet.
