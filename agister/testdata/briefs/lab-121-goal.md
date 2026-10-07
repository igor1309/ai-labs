# LAB-121: export runs for audit

## Intent

ADR-026 rule 7 (`agister/docs/adr/026-the-brief-is-a-runs-input-contract.md`):
runs need an export. Briefs and goals are kept in the run, not the
repository (rule 6), so runs are the audit material, and the run store
(`<home>/runs/`) is one host, not replicated as a repository is. Multica
LAB-121: a command that copies a run to a durable place the caller names;
mechanical, no selection or rewriting.

## Done when

1. **The command.** `agister runs export <run-id>... --to <dir>` copies
   each named run's directory from the run store to `<dir>/<run-id>/`:
   its record, events, provider log and artifacts, byte for byte. A
   workflow run brings each of its nodes' runs with it, as named in its
   record, to `<dir>/<node-run-id>/`. Nothing is rewritten, selected or
   summarized. A run's lock file, which is the store's own state and not
   evidence, is not copied.
2. **Refusals**, before anything is written, with the contract exit code:
   a run that does not exist; a run that has not finished (it, or one of
   its nodes, is still running); `--to` missing or not a directory.
3. **Repeatable.** Exporting a run again to the same place leaves an
   identical copy as it is and says so. A copy that differs is never
   overwritten: the export is refused for that run and says which file
   differs.
4. **Checked.** After copying, each artifact the record names is read
   back from the copy and its digest compared with the recorded one; a
   mismatch fails the export and names the file. The command reports, per
   run, what it copied (files and bytes) or kept.
5. A copy is written so an interrupted export leaves no partial run that
   a later export would take as identical (for example a temporary
   directory renamed into place).
6. Regular tests prove 1 to 5 with the existing seams, with the run store
   and the destination under `t.TempDir()`: a process run, a workflow run
   with its nodes, each refusal, the repeat that keeps an identical copy,
   the refusal on a differing copy, and a digest mismatch.
7. The done gates say the same as the binary: the caller skill
   (`agister/skills/agister/SKILL.md`), `agister/README.md`,
   `agister/docs/settings-architecture/` and `agister/pages/` with its
   tests. Say in the implementer's notes which needed no change and why.

## Out of scope

- Selecting runs by date, process or repository, and exporting the whole
  store: the caller names the runs.
- Following `links.goal` and `links.judgement` to other runs: they are
  references by id; the caller exports those runs by name.
- Removing runs from the store, compressing, or any remote upload.
- Any change to settings or to what a run records.

## Sources

- Multica LAB-121.
- ADR-026 rules 6 and 7; ADR-001 rule 10.
- `research/agister/research/brief.md` §7, "Where it lives".

## Decisions

- 2026-10-07, owner: take LAB-121.

## Open

None.
