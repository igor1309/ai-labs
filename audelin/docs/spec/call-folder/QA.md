# Call folder — QA

An adapter over the file system, so every row runs against a fresh
temporary calls folder, never the user's own, and checks it from outside
the adapter with `FileManager`. The adapter is given a fixed clock and the
time zone `Asia/Tokyo`, while the process runs in `America/Los_Angeles`,
so names are known and the given zone is proven used; every row runs with the process's
default locale set to one with another calendar and digits
(`ar_SA`), which must not change a name. The real call of the user spec
(LAB-408) proves the whole path.

## S-1 A call gets its own folder

A clock at 2026-10-24 05:05:30 UTC; the folder made is
`2026.10.24-1405` directly in the calls folder, and is a folder. Its
places for the microphone track, the call track and the transcript are
three different files directly inside it, none existing yet; opening a track
file and the transcript in the made folder creates them there.
Evidence: `madeFolderUsesGivenTimeZoneAndContainsWritablePlaces`.

## S-2 A second call in the same minute gets its own folder

Three makes for starts in the same minute give `…-1405`, `…-1405-2` and
`…-1405-3`; a file written into the first is unchanged after the others.
Evidence: `threeCallsInSameMinuteKeepSeparateFoldersAndFirstContents`.

## S-3 A name taken by a file is not used

A file at `2026.10.24-1405`; the make gives `…-1405-2`, and the file's
bytes are unchanged. Evidence: `fileTakingNameIsSkippedWithoutChangingBytes`.

## S-5 A missing calls folder fails

The calls folder is removed first; the make fails and neither it nor a
call's folder exists afterwards. Evidence: `missingCallsFolderFailsWithoutCreatingAnything`.

## S-6 A folder that cannot be made fails

The calls folder is made read-only; the make fails and the calls folder is
empty. A supplied mkdir failure makes this deterministic even for a runner
allowed to write read-only folders. Retrying after the failure uses the base
name. Evidence: `failedMakeLeavesCallsFolderEmptyAndNameAvailable`.

## S-7 A name taken by a link is not used

A symlink to a folder at `2026.10.24-1405`; the make gives `…-1405-2`,
and the link and its target folder are unchanged.
Evidence: `symlinkTakingNameAndItsTargetRemainUnchanged`.

## S-9 A name taken by a broken link is not used

A symlink to a path that does not exist at `2026.10.24-1405`; the make
gives `…-1405-2`, the link is unchanged, and nothing is made at its
target. Evidence: `brokenSymlinkTakingNameIsSkippedWithoutCreatingTarget`.

## S-8 Every taken name is passed over

A folder at `…-1405` and a file at `…-1405-2`; the make gives `…-1405-3`,
and both are unchanged. Evidence: `everyTakenNameIsSkippedWithoutChangingFolderOrFile`.
