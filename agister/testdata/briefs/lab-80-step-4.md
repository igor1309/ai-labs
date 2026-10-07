# LAB-80 step 4: drop the Linux code

## Goal

`agister/testdata/briefs/lab-80-goal.md`

## Covers

- The goal's last decision: the Linux code goes; Done when 3 and 4 apply
  to macOS only.

## Acts on

`gokit/supervisor`: remove the Linux-specific implementation and
everything that exists only for it: `group_linux.go`, the `/proc` scan
(`proc.go`, `procOthers`, `errUnsettled` if nothing else uses it) and
its tests (`proc_internal_test.go`), and the Linux expectations in
`exec_test.go` and any other test. Linux then builds with the same
fallback as other non-macOS systems (`group_other.go`: the exit cannot
be observed, so the group is killed before the reap and the cleanup is
reported as unknown); widen that file's build constraint to include
Linux and make its comment say macOS is the only platform observed
without reaping. Keep the macOS code, the shared ordering, its tests,
and everything else as it is. Comments and docs that mention Linux's
`waitid` or `/proc` are updated to match.

Check: `GOOS=linux go vet ./...` in `gokit` still passes.

## Constraints

- No behaviour change on macOS.
- gokit depends on the standard library only (ADR-019).

## Open

None.
