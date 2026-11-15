# Calls storage: the calls-folder claim — QA

CallsStorage is an adapter; its claim touches no disk, so rows drive a real
CallsStorage over a temporary folder and read back each answer. Run:
`cd audelin/macos && ../scripts/swift-test-bounded.sh 600 --filter CallsFolderClaimTests`.

## S-1 A free folder is granted

Evidence: `aFreeFolderIsGranted`, `eachGrantHasANewToken`.

## S-2 A held folder is refused with its holder

Evidence: `aHeldFolderIsRefusedWithItsHolder` (every holder pair).

## S-3 Two takes at once grant one

Evidence: `twoTakesAtOnceGrantOne`.

## S-4 A release frees the folder

Evidence: `aReleaseFreesTheFolder`.

## S-5 A stale release frees nothing

Evidence: `aStaleReleaseFreesNothing`.

## S-6 The claim works without Recording

Compose test: Recording fails to start; a move is granted and a relaunch is
refused by the move. Evidence: `relaunchTakesTheClaimWhenRecordingFailedToStart`
(the relaunch claim is granted with no Recording). The move half is Missing:
the composition gives a test no way to hold its move in flight.
