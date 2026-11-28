# Splitting a call

The "Calls — split …" frames in [visual-language.pen](visual-language.pen)
draw splitting one recorded call into two at a gap. Each screen is a light
component with a dark instance. Their parts are on the board
"Split — components": Split button and its disabled variant, Help tip,
Split choice/Default and /Selected, Split part and Split sheet.

## Toolbar

- The scissors button sits in the list's title bar after merge, for the
  selected call.
- While splitting is not offered the button is disabled (`disText`) and the
  reason is its help tooltip: Audelin is busy, the transcript is still
  being checked or cannot be read, it has fewer than two entries, or the
  call is outside the active calls folder.

## Sheet

- The sheet lists the gaps between entry starts, longest first. Each shows
  the gap, the cut time, the entry before and the entry after. A gap whose
  phrases suggest a meeting ending or starting carries the `warn` mark
  «похоже на смену встречи». The first choice is selected; the list
  scrolls when it is taller than the sheet.
- Both names default to the original title. The prefix is each part's
  folder minute: part 1 keeps the original, part 2 is the cut rounded down
  to the minute. The span beside each label is the part's start and length.
- «Отменить» closes the sheet and leaves the call as it was.

## Waits and outcomes

- Splitting: both buttons disabled, «Разделяю…», and a status line saying
  the split cannot be sent again.
- Failed: the choice and names stay, Banner/Error in the sheet names the
  reason and that the call is unchanged, and «Разделить» is enabled again.
- Done: the sheet closes and part 1 is selected; both parts show their
  notes waits as any new call does.

## States

| Frame | What it shows |
|---|---|
| Calls — split | The sheet with the first gap selected and both names edited |
| … splitting | The split under way |
| … split failed | The error banner in the sheet |
| … split unavailable | The disabled button with its help |
| … split, narrow | 560 pt; the sheet fills the window width |

Open: the help sentence for each refusal reason; the wording of each
failure reason.
