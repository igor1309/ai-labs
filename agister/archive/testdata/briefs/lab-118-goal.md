# LAB-118: a disposable working copy of the brief, and explicit links between runs

## Intent

ADR-026 rule 6 (`agister/docs/adr/026-the-brief-is-a-runs-input-contract.md`):
a brief belongs to the run. The run keeps the durable copy (LAB-117). A
disposable working copy may sit under `~/.agister/cache/`, in a record
field whose name says it is disposable. A run records the goal it serves
by reference and digest; nothing is found by searching runs. ADR-026 rule
2: a review round's brief names the judgement it answers.

## Done when

1. **Working copy.** A run copies the bytes of each `file` input to
   `<agister home>/cache/<sha256 hex>/<base name of the file>`, and the
   record's input names that path in `cache_path`. The folder is named
   by the bytes' digest, so a copy is never overwritten with other bytes;
   one that already holds them is left as it is. A later run that is given
   that path reads the same bytes and records the same digest. A copy that
   cannot be written does not fail the run: it is reported as an event, as
   `ARTIFACT_FAILED` is, and `cache_path` is left unset. This holds for a
   process run's inputs and for a workflow run's inputs.
2. **The goal a run serves.** `agister run <name> --goal <run-id>[:<input>]`
   records `links.goal` with the run's id, the input's name (by default
   `goal`) and its digest, plus the artifact that keeps its bytes when
   there is one (LAB-117), all read from that run's record. Agister
   refuses the call before it starts when the run does not exist, has no
   such input, or the input's bytes are kept nowhere in that run (neither
   inline nor as an artifact).
3. **The judgement a run answers.** `agister run <name> --answers <run-id>`
   records `links.judgement` with that run's id. Agister refuses the call
   before it starts when the run does not exist or did not complete.
4. Both options are optional, and a run without them records no `links`.
   A record written before this change still reads (`runs show`, Pages,
   the hold).
5. `agister runs show <id>` shows `links` and each input's `cache_path`.
6. Regular tests prove 1 to 5 with the existing seams: a copy is written
   once and reused; a copy that fails is reported without failing the run;
   `--goal` and `--answers` are recorded, and each refusal case is
   refused. A home or cache directory comes from `t.TempDir()`, never the
   real `~/.agister`.
7. The done gates say the same as the binary where they describe inputs,
   the record or `agister run`'s options: the caller skill
   (`agister/skills/agister/SKILL.md`), `agister/README.md`,
   `agister/docs/settings-architecture/` and `agister/pages/` with its
   tests. Say in the notes which needed no change and why.

## Out of scope

- Cleaning the cache; the cache is disposable and may be removed at any
  time.
- Templates and the structural entry check (LAB-119); the export of runs
  (LAB-121).
- Reading a brief to find its goal: the caller names it.
- No change to what a process or workflow takes, or to the values an
  agent receives.

## Sources

- Multica LAB-118.
- ADR-026 rules 2 and 6; ADR-001 rule 10.
- `research/agister/research/brief.md` §7, "Where it lives".
- LAB-117: input artifacts (`recordInputs`, `agister/internal/app/calls.go`).

## Decisions

- 2026-10-07, owner: the design in Done when 1 to 3 (a working copy named
  by its digest, `--goal` and `--answers`).

## Open

None.
