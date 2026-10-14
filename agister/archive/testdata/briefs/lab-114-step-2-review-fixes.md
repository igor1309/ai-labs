# LAB-114 step 2 review fixes

Fixes from the code review of LAB-114 steps 1 and 2 (ADR-025,
`agister/docs/adr/025-a-call-works-where-it-is-called.md`), and one
flaky test seen since. Change only what these items need.

## 1. The hold stays in `locks/in-place`

Step 2 renamed the directory of the worktree holds from
`locks/in-place` to `locks/holds` (`cmd/agister/main.go`, the
`Holder`'s `WorktreeLocks`). A call of the binary before the rename
holds its lock file in `locks/in-place`, under the same key: the
installed binary (before ADR-025) takes it alone, step 1's binary
shared or alone. A writer of the new binary takes a file in the other
directory, so both run in one worktree at once, which ADR-025 rule 4
forbids, and the record scan does not catch a reader (it records no
claim).

Keep the directory `locks/in-place` on disk; keep the Go names as they
are. Say in the wiring comment why the directory keeps its old name
(holds of a binary still running must exclude the new ones). Every test
that names `locks/holds` follows.

Done when a committed test in `cmd/agister`, over temporary directories
and the real flock adapter, holds the worktree's lock file in
`locks/in-place` as an older call would (shared, as a reader) and shows
that a writer call of the composed binary is refused.

## 2. Strict listing fails on a record that cannot be read

`fsruns` strict listing must fail on a run whose `record.json` exists
but cannot be read, not only on one that cannot be parsed. No test
makes the read itself fail. Add a subtest to
`TestListStrictSkipsARunBeingCreatedAndFailsOnABrokenRecord`: with
`t.TempDir()`, put a directory at a run's `record.json` path; `ListStrict`
returns an error naming that run and no records.

## 3. A released hold can still look held (flaky test)

`TestCleanupRunCancelsAndDrainsABlockedCall` (`cmd/agister/reap_test.go`)
sometimes fails, under a loaded full test run, with "the worktree is
still held" after its run is finished. `Calls.execute` releases the
hold before it finishes the record, so the order is right. The likely
cause: the release only closes the descriptor
(`internal/adapters/system/locks.go`). A flock belongs to the open file
description; a process forked at that moment (any command another test
or call starts) has a copy of the descriptor until its exec closes it
(close-on-exec), and the lock is held until that copy is closed too. In
production the same window can refuse a call right after another one
ended.

Confirm the cause from the code first; if it is something else, fix
that and say what it was. If it is this one: release with
`flock(LOCK_UN)` on the descriptor before closing it; unlocking acts on
the open file description, so a copy in a child no longer holds it.

Done when a committed, deterministic test in the `system` package shows
it: take a hold, duplicate its descriptor (as a fork would; a test in
the package may reach the file), release the hold, and take the hold
alone again, succeeding while the duplicate is still open. If the test
needs a seam to reach the descriptor, add it.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`.
Regular committed tests only; no mutation or revert checks.
