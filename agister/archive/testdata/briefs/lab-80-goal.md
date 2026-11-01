# LAB-80: the supervisor kills a group before it reaps the group's leader

## Intent

Multica LAB-80. `gokit/supervisor` waits for its child with
`process.Wait()`, which reaps it, and only then sends SIGKILL to the
child's process group to end what it left running (`Runtime.Run` in
`supervisor.go`, and `command.go`). Once the leader is reaped and the
group is empty, the kernel may reuse the ID, so that kill can reach an
unrelated group, and `Runtime.Run` then reports the stranger as
`LEFTOVER_PROCESSES_KILLED`. Found by code_review
`20261005T125640Z-156a04` (LAB-63).

The repository's rule for this is already written:
`prompts/go-process-supervision.md`, "Signal the group only while its ID
is reserved by the unreaped leader" and "What the child left running".
This change makes the supervisor follow it.

## Done when

1. **Observe, kill, then reap.** Both places that wait for a child
   (`Runtime.Run` and the command runner in `command.go`) observe the
   leader's exit without reaping it, then, under the signal/reap lock,
   send SIGKILL to the group and classify the result, disable later
   signals, and only then reap. No other path reaps the leader first.
2. **The seam.** The `Process` interface (`starter.go`) separates
   observing the exit from reaping it, so the order is a contract every
   `Process` keeps: `Exec`'s, `supervisortest`'s in-process fake and
   agister's `runtimetest` fakes. A unit test with a fake process
   asserts the order (exit observed, group signalled, then reaped) for
   both call sites, and fails if the kill comes after the reap.
3. **The operating system.** `Exec` observes the exit without reaping:
   `waitid` with `WEXITED | WNOWAIT` on Linux
   (`golang.org/x/sys/unix.Waitid`), and on macOS whatever the platform
   offers for the same (x/sys has no `Waitid` for darwin: the `waitid`
   system call, or kqueue `EVFILT_PROC`/`NOTE_EXIT`); say which in the
   notes and why.
4. **Contract tests.** Real-process tests, under `t.TempDir()` where
   they need files, for the group kill after the exit: with a live
   descendant left in the group (the kill reaches it, the result is
   leftovers) and without one (the result is no leftovers). They also
   pin what a zombie leader alone means for the kill's result on the
   platform the test runs on, as the prompt asks. They run on macOS,
   where CI runs; the Linux variant builds (`GOOS=linux go vet` in
   `gokit`) and runs on Linux when tested there.
5. Exit codes, signals, timeouts, cancellation, stale detection and the
   events a run records are unchanged apart from the ordering.
6. The done gates: if the caller skill (`agister/skills/agister/SKILL.md`)
   or `agister/README.md` describe leftover handling, they say the same
   as the code. Say in the notes which needed no change.

## Out of scope

- The recovery reaper (`processes.go` `Reap`), which kills a recorded
  group from another process by its token check.
- Changes to `prompts/go-process-supervision.md`.

## Sources

- Multica LAB-80; code_review `20261005T125640Z-156a04`.
- `prompts/go-process-supervision.md`.
- `gokit/supervisor/supervisor.go`, `command.go`, `starter.go`,
  `supervisortest/`.

## Decisions

- 2026-10-07, owner: take LAB-80.
- 2026-10-07, owner (review 1, item 5#3): option (c). `Commands.Run`
  kills the group before reaping but does not classify or report the
  result; Done when 1's classification applies to `Runtime.Run` only.
  `CommandResult` is unchanged.
- 2026-10-07, owner (review 1, item 5#4): option (b). Done when 5 allows
  the additive event `LEFTOVER_CLEANUP_UNKNOWN`, recorded only when the
  cleanup cannot be classified; `runs watch` shows it with the other
  process events.
- 2026-10-07, owner (review 2, items 3#2 and 5#2): option (b). On Linux,
  when the process snapshots cannot prove what the group kill reached
  (for example a member that becomes a zombie after the kill), the
  cleanup is reported as unknown (`LEFTOVER_CLEANUP_UNKNOWN`), never as
  no leftovers.
- 2026-10-07, owner: drop the Linux code. Agister runs and is tested on
  macOS only. Linux takes the same fallback as other non-macOS systems
  (kill the group before the reap, cleanup reported as unknown). This
  supersedes Done when 3's and 4's Linux parts and the Linux decision
  above.

## Open

None.
