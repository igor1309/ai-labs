# Merging calls — QA

Each row is a live test: the built app on a temp calls folder of fixture
calls cut from one recorded call, driven through the accessibility API by
element identifier, reading back what the app shows and what is on disk.
A wait the test must see is held open by a fake collaborator. Every row
reads Missing until its test exists.

## S-1 Merging calls into one

Switch to merge mode, select two parts, confirm. The list holds one call in
their place, with the earliest part's title and start; its transcript holds
both parts' entries in order with the gap between them; its notes are made
from the whole transcript; the parts' audio files are byte for byte as they
were. Evidence: Missing.

## S-2 No merge while Audelin is busy

With a fixture recording running, and again with a fake notes service held
open, merge mode is unavailable and its reason reads why. Evidence: Missing.

## S-3 A merge that fails

With writing the merged transcript failing, both parts list and read as
before and the failure reads why. Evidence: Missing.
