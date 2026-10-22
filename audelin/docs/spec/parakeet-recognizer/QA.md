# Parakeet recogniser — QA

The windowing is driven through a fake of the Parakeet binding that replays
the windows recorded from Parakeet v3 in research run 5, with silence of the
recording's length as the audio. The binding itself runs for real, over
speech the system's Russian voice reads into a temp file.

## S-1 Nothing is heard before a window's audio is in

Audio up to just short of the first window's end. Evidence: Missing.

## S-2 Words before the right context are final

The second recorded window: the words ending by its chunk's end are final.
Evidence: Missing.

## S-3 Words in the right context are pending

The first recorded window: the words after its chunk's end are reported and
not final. Evidence: Missing.

## S-4 The next window reads pending words anew

The second recorded window replaces the first window's right-context words
with its own reading. Evidence: Missing.

## S-5 A pending word the next window does not hear is gone

A fake window reads a word in its right context; the next fake window reads
none there. Evidence: Missing.

## S-6 Words two windows read are heard once

The whole recording through Live text: no word settles twice, and every
word a window's chunk holds settles. Evidence: Missing.

## S-7 A word no later window reads is final

A fake window's last word starts in its right context before the next
window and ends past it. Evidence: Missing.

## S-8 Finishing hears the rest

Audio stopping mid-chunk; finishing reports the remaining windows' words,
all final. Evidence: Missing.

## S-9 Audio at another sample rate is heard

Parakeet v3 for real over the system voice reading a Russian sentence at
48 kHz. Evidence: Missing.

## S-10 A failing model fails the recogniser

The fake binding throws on a window. Evidence: Missing.
