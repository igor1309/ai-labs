# Scripted settings — QA

Driven in `ScriptedSettingsTests` with files in a temporary directory and an injected file-change seam that the real watcher also drives. `DirectoryChangesTests` holds the real watcher to that seam's contract: it sees a file created, replaced and appended to.

## S-1 A valid file

Write a file with a client, two hosts and Bluetooth on: the settings read back equal the file's, and Bluetooth reads on. Evidence: ScriptedSettingsTests.validFile.

## S-2 No valid file

For each row: Bluetooth reads unavailable and the kind is the row's; for the invalid file, which holds an amount, no reported text contains it. Evidence: ScriptedSettingsTests.unavailableKinds.

## S-3 A file changed

Subscribe to the settings' updates after reading a confirming file; rewrite it to decline with Bluetooth off and fire the file-change seam: an update with decline and off arrives without another request, and an explicit read then gives the same. Evidence: ScriptedSettingsTests.changedFile.

## S-4 A broken file mended

Subscribe with no file at the path (unavailable, missing); write a valid one and fire the file-change seam: an update with its settings and Bluetooth on arrives without another request. Evidence: ScriptedSettingsTests.mendedFile.

## S-5 Choosing air capture

Decode a file with capture on and one omitting it: read back the explicit choice and the off default. Evidence: AirRecorderTests.settingsOptIn.
