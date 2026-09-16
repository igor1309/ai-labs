---
date: 2026-08-23
model: claude-opus-5
description: "Xcode disk cleanup — iOS 16.4/18.6 simulators are in active use; never propose them as stale. APFS snapshots, not deletion, decide whether space returns"
---

# Xcode Disk Cleanup

## Simulator runtimes in active use — never propose

The iOS **16.4 (20E247)** and **18.6 (22G86)** simulator runtimes, and their
devices (`iPhone 11 Pro ios16`, `iPhone 14 Pro Max Igor ios16`,
`iPhone 15 Pro ios18`, `iPhone 15 Pro release`), are **actively used for
back-deployment testing**. Confirmed 2026-08-23.

The `xcode-disk-cleanup` skill's scanner labels both `Stale simulator runtime`
because no installed Xcode SDK resolves to their build and a newer runtime
supersedes them on the same platform. That criterion does not model testing
against old iOS versions, so it is **wrong on this machine**. Demote every
16.4 and 18.6 candidate to preserve and say so in the proposal.

Their recent `Last used` timestamps are exactly the live contrary evidence the
skill tells you to trust over a scanner label — read that field before
believing the classification. Deletion is irreversible
(`simctl runtime delete`) and costs a multi-GB re-download plus four
configured devices and their installed app state. Other superseded runtimes
(26.4, the older 27.0 betas) were not contested and remain fair candidates.

## Freed space does not return until snapshots are purged

On this Mac, deleting files frees **nothing** while a Time Machine local APFS
snapshot still references them. Observed 2026-08-23: trashing 82 GB of
DerivedData plus ~9 GiB of build folders moved free space *down*; deleting
nine local snapshots returned 48 GiB, and the last one returned a further
88 GiB.

- **Check snapshots before reporting a cleanup result.** `tmutil
  listlocalsnapshots /` and `diskutil apfs listSnapshots /System/Volumes/Data`
  — the latter flags `Purgeable: Yes` and "limits the minimum size of APFS
  Container".
- **A snapshot taken before the deletion still pins the deleted blocks.**
  Keeping "the newest" snapshot is no protection against this: snapshots are
  taken hourly, so the newest usually predates the cleanup by minutes.
- **Never claim space was recovered from a `du` or Trash-empty alone.** Report
  measured `df` delta, and report summed candidate sizes separately from actual
  APFS space recovered.

## Measurement blind spots

`~/.Trash`, `~/Library/Mail`, and `~/Library/Messages` return "Operation not
permitted" without Full Disk Access, so `du` reports them as **0, not empty**.
Say they are unmeasured rather than omitting them. Finder via
`osascript -e 'tell application "Finder" to get name of every item of the
trash'` still enumerates the Trash when `ls` cannot.

Emptying the Trash fails with `-8076` while any process holds a handle inside
it; `lsof | grep /\.Trash` names the holder. Long-lived Xcode XPC helpers
(`SWBBuildService`, `SKAgent`) are the usual cause and can outlive Xcode itself
by days.

## OrbStack

`orb prune` does not exist — `orb` manages Linux machines. Container storage is
Docker's: size it with `docker system df` and reclaim with `docker image prune`.
OrbStack keeps its data in a sparse disk image, so freeing inside Docker does
not immediately shrink the host file.
