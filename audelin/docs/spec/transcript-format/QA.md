# Transcript format — QA

A pure adapter: every row renders numbered segments on both sides and reads
the rendered Markdown back as compose would hand it to the user, checking its parts, never
just that a call was made. The real call of the user spec (LAB-408) proves
the whole path with the transcript file.

## S-1 Rendered text can be read

Four numbered segments, mine and theirs interleaved, are rendered; the text
holds each in the order given, marked mine or theirs, with its start time.
Settled-only, pending-only and mixed segments hold all their words.
Evidence: Missing.

## S-2 Revised text renders only the revision

Segments with pending text are rendered, then the same segments settled
with different words; the text holds only the settled words, and a segment
dropped by the revision is gone. Evidence: Missing.

## S-3 Text filled in later is marked

Live segments and segments marked written later are rendered; only the
latter are marked as filled in later. Evidence: Missing.

## S-4 No text says none was heard

No segments are rendered, then text, then no segments again; both empty
renderings say no text was heard. Evidence: Missing.

## S-5 Final parts without words say none was heard

Final segments without words are rendered, then text after them, then
none after them again; the text says no text was heard, then holds the
words, then says no text was heard. Evidence: Missing.

## S-6 Final text stays the start of every rendering

Text with one final segment and a pending one is rendered; the pending
words grow, the second becomes final, a third is added. Each rendering
starts with the earlier final text byte for byte, tells its length, and
asks only for segments after the final ones. Evidence: Missing.

## S-7 A failed rendering is told

S-9's drive up to the failure, which is told. Evidence: Missing.

## S-9 Rendering after a failed one keeps the final text

Text with a final part is rendered; then text with a segment whose start
is not a finite time fails. The next rendering of good text holds the whole
text, starts with the earlier final text byte for byte, tells the same
final length, and asks only for segments after the final ones, so the
earlier rendering was kept.
Evidence: Missing.

## S-8 A replaced transcript renders from nothing

Text with final parts is rendered; then a replacement whose final parts
hold other words is rendered from nothing. Its Markdown holds the new
words and none of the old, and tells the new final length.
Evidence: Missing.
