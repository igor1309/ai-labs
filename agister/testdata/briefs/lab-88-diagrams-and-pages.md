# Diagrams and Pages show the in-place workspace (LAB-88, diagrams)

ADR-022 (`docs/adr/022-a-call-may-work-in-the-callers-worktree.md`) is
implemented on this branch, and the README and caller skill are updated.
Bring the settings diagrams and the Pages settings view up to date.
Match each file's existing style and density. Describe what the binary
reads (see `internal/domain/definition/documents.go`), and invent no fields.

## Wanted

1. **`docs/settings-architecture/detailed.html`.**
   - The Workspace section's lead and Holds table gain:
     - `mode` (`in-place` or `temporary`, the default; the repository's default for processes with a checkout, overridden by `agister run --workspace`);
     - `precheck.command` and `precheck.timeout` (gates an in-place call; runs under the worktree's lock);
     - a note that `setup` does not run in-place.
   - Its example `workspace.yaml`, if any, shows `mode` and `precheck`.
   - The Verification section's Holds table gains `where` (optional; only `workspace`: an in-place call verifies in the worktree, every other call on a clean copy).
2. **`docs/settings-architecture/index.html`.** The "Workspace and blocks" paragraph says the workspace also holds the default mode and the precheck. If the diagram shows the verification's fields, add `where`.
3. **`docs/settings-architecture/notes.md`.** Cite ADR-022 as the source for the new fields, as it cites the other ADRs.
4. **Pages, `pages/config.js` and `pages/page.js`.**
   - `loadWorkspace` reads `mode` and `precheck` besides `setup`.
   - The verification model reads `where`.
   - Where the page shows a process's effective setup, it also shows its effective default mode (`in-place`, `from workspace.yaml`) and the precheck.
   - Where it shows a verification, it shows `where: workspace`.
   - Update the `config.js` comments that describe `workspace.yaml`.
   - Add tests in `pages/tests/config.test.js` and `pages/tests/page.test.js`, in the existing style:
     - mode and precheck parsed from home's and the repo's `workspace.yaml`;
     - the repo's document replaces home's;
     - the absent mode reads as `temporary`;
     - `where` parsed;
     - the page shows them.

## Check

From `agister/`: `node --test pages/tests/*.test.js && go test -count=1 ./pages/ && test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./...`.

List every file you changed.
