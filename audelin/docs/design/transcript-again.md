# Making a transcript again

The "Calls — transcript again …" and "Calls — notes from previous
transcript" frames in [visual-language.pen](visual-language.pen) draw making
a call's transcript again from its audio, and restoring the previous one.
Each screen is a light component with a dark instance. Their parts are on
the board "Transcript again — components": Run row with /Preparing,
/Hearing and /Finishing, Context menu/Transcript again and its disabled
variant, Banner/Error, retry, and Notes mark.

## Menu

- The row menu holds «Распознать заново» after Переименовать, and
  «Вернуть прежний транскрипт» after it when the call has a previous
  transcript; without one, the item is absent.
- While a run cannot start (a recording, other work, missing tracks), the
  items are disabled (`disText`) and the reason is the item's help tooltip.

## Waits

- The call being made again shows its wait in its own row, in place of the
  gist: «Готовлю распознавание…» and «Дописываю транскрипт…» with a
  spinner, «Распознаю заново» with a progress bar. Each has «Отменить» in
  `me` on the right. The other rows and calls stay usable.
- Narrow (560 pt) the row is the same over the full-width list.

## Outcomes

- A failed run: Banner/Error, retry at the foot of the list, naming the
  reason, with «Повторить».
- A stop by a recording: Banner/Info, «Распознавание остановлено» and that a
  recording started; no button.
- The previous transcripts stay in place in both; the banner says so.

## Notes mark

- Notes made from another transcript show Notes mark above the summary: a
  `history` icon and «Сделаны по прежнему транскрипту» in `warn`. Each
  shown version (Предыдущие, Текущие) carries its own mark.

## States

| Frame | What it shows |
|---|---|
| Calls — transcript again menu | The menu with both items |
| … menu, disabled | Both items disabled, the reason as help |
| … preparing, hearing, finishing | The run's wait in its row |
| … failed | The error banner with Повторить |
| … stopped | A recording started |
| Calls — notes from previous transcript | The notes mark |
| … hearing, narrow | 560 pt |

Open: the help sentence for each refusal reason; a failed restore uses the
same error banner, without Повторить, and is not drawn.
