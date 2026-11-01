# LAB-114 step 3: the done gates say what ADR-025 changed

Step 3 of 3 for ADR-025 (`agister/docs/adr/025-a-call-works-where-it-is-called.md`,
accepted). Steps 1 and 2 (commits d9242387, b6383052 and the review fix
after them) changed the binary: every call works in the caller's
worktree, or the one `--dir` names; `workspace.revision` (was
`checkout`) pins HEAD; `workspace.clean: true` refuses a dirty worktree
for a fresh call; readers share the worktree and a writer (a plan that
grants a `writing` permission, or a process with `verify`) holds it
alone; verification runs in the worktree; `changes.patch` is evidence,
and the changes stay in the worktree; a continuation resumes in the same
worktree; workflows run there too. Removed: `--workspace`,
`workspace.yaml` (`mode`, `precheck`, `setup`: obsolete, warned about by
`check`), process `workspace.setup`, verification `where`, Agister's own
checkouts and clean copies. Read the ADR and the code for the exact
behaviour; do not change the code's behaviour here.

## What changes

Make each of these say the same as the binary (`agister/AGENTS.md`'s
done gates):

1. **The caller skill**, `agister/skills/agister/SKILL.md`: how to run a
   process or workflow (in your worktree, `--dir`), what a run leaves
   (the changes in the worktree, uncommitted; `changes.patch` as
   evidence; nothing to apply), continuing a run, preparing a
   repository's `.agister/` (no `workspace.yaml`; `revision`, `clean`).
   Remove what it says about applying a patch, checkouts, setup,
   `--workspace` and `workspace.yaml`. Its tests
   (`agister/cmd/agister/caller_skill_test.go`) follow.
2. **`agister/README.md`**: the same, with ADR-025 in its text where the
   superseded ADRs (005, 008, 012, 013, 022) are cited for behaviour that
   is gone.
3. **The settings diagrams**, `agister/docs/settings-architecture/`
   (`index.html`, `detailed.html`, `notes.md`): no workspace settings
   document, the process's `workspace.revision` and `workspace.clean`, no
   setup.
4. **The Pages settings view**, `agister/pages/` (`config.js`, `page.js`,
   `README.md` and their tests, `pages/tests/`, `serve_test.go`): it shows
   what the settings now hold: `revision` and `clean`, no `checkout`,
   `setup`, `mode` or `precheck`, no `where`. Run its JS tests as
   `pages/README.md` says, as well as the Go check.
5. **`agister/AGENTS.md`**: the `implement` step no longer applies a
   patch. It becomes: commit the candidate so the worktree is clean, write
   the brief to a file, run `agister run implement --param candidate=HEAD
   --param brief=<file>` from the change's worktree, and its changes are
   then in that worktree, uncommitted, for the caller to verify and
   commit. Reviews run from the same worktree with the candidate checked
   out (`--param candidate=HEAD`); they are readers and run together.

## Done when

- Each of the five says the same as the binary; no text in them tells a
  caller to apply a patch, pass `--workspace`, write `workspace.yaml`,
  declare `workspace.checkout` or `setup`, or expect a clean copy.
- Their tests pass: the Go check below and the Pages JS tests.

## Constraints

- Docs and their tests only; no change to the code's behaviour.
- Regular committed tests only. Match the surrounding text's style:
  plain, short sentences, ADRs cited by number.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`,
and the Pages JS tests as `agister/pages/README.md` says.
