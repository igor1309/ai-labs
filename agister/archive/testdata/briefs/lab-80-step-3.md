# LAB-80 step 3: Linux reports cleanup unknown when it cannot prove it

## Goal

`agister/testdata/briefs/lab-80-goal.md`

## Covers

- Done when 1 (classification), with the goal's decision on review 2
  items 3#2 and 5#2.

## Acts on

The Linux classification of the group kill (`group_linux.go`, the shared
`procOthers` scan and `Exec.Signal`). Today it takes two live-only
snapshots of the group's non-leader members; a member that becomes a
zombie after the kill is missed and the cleanup is reported as no
leftovers. Per the owner's option (b): whenever the snapshots cannot
prove what the kill reached (membership seen before the kill but not
accounted for after it, a member found only as a zombie, or any other
case the scan cannot settle), the result is the cleanup-unknown error,
so `Runtime.Run` records `LEFTOVER_CLEANUP_UNKNOWN`, not no leftovers.
"No leftovers" stays only for a group the scan proves had no other
member.

Tests: regular tests over the existing `fs.FS` proc seam with temporary
fixtures: a member that turns zombie between the scans, a member that
disappears, and a group with no other member. Each asserts the
classification.

## Constraints

- macOS behaviour unchanged.
- gokit depends on the standard library only (ADR-019).

## Open

None.
