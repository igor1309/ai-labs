# Scripted settings — QA

Driven in `ScriptedSettingsTests` with files in a temporary directory and an injected file-change seam that the real watcher also drives.

## S-1 A valid file

Write a file with a client, two hosts, Bluetooth on and a key: the settings read back equal the file's, and Bluetooth reads on. Evidence: Missing.

## S-2 No valid file

For each row: Bluetooth reads unavailable and the kind is the row's; for the invalid file, which holds an amount, no reported text contains it. Evidence: Missing.

## S-3 A file changed

Subscribe to the settings' updates after reading a confirming file; rewrite it to decline with Bluetooth off and fire the file-change seam: an update with decline and off arrives without another request, and an explicit read then gives the same. Evidence: Missing.

## S-4 A broken file mended

Subscribe with no file at the path (unavailable, missing); write a valid one and fire the file-change seam: an update with its settings and Bluetooth on arrives without another request. Evidence: Missing.
