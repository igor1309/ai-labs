# Re-recognition offer — QA

Rows drive the built app by a checked-in live scenario on fixture calls,
opening each row's menu by its accessibility identifier and reading the
item's enabled state and its reason.

## S-1 A kept call offers it

A fixture with both tracks, Audelin idle: the item is enabled, after Переименовать.
Evidence: Missing.

## S-2 One track missing

A fixture missing its call track: the item is disabled, naming that track.
Evidence: Missing.

## S-3 All audio missing

A fixture with no tracks: the item is disabled, saying the audio is missing.
Evidence: Missing.

## S-4 An original call missing audio

A merged fixture whose second call lacks its microphone track: disabled, naming that call and track.
Evidence: Missing.

## S-5 Audelin busy

Four runs: recording, notes being made, a calls-folder move, a held restore: the item is disabled with each reason.
Evidence: Missing.

## S-6 Renaming the call being made again

During a held run, rename that call: refused with the reason; its name is unchanged.
Evidence: Missing.

## S-7 Deleting the call being made again

During a held run, delete that call: refused with the reason; its folder remains.
Evidence: Missing.

## S-8 Restoring on the call being made again

During a held run, restore that call: refused with the reason; its files are unchanged.
Evidence: Missing.

## S-9 Another call is used as usual

During a held run, rename another call: its folder carries the new name.
Evidence: Missing.

## S-10 Same place without notes

A fixture with notes and one without: the item is at the same index after Переименовать in both menus.
Evidence: Missing.

## S-11 A merge under way

Hold a merge: the item is disabled with the reason.
Evidence: Missing.

## S-12 Merging during a run

Hold a run, then confirm a merge: it is refused with the reason, and no folder moved.
Evidence: Missing.
