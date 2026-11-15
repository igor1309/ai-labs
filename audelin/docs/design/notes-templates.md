# Notes templates — brief

Frames: the row "Calls — regenerate menu …" below the merge outcomes, its
dark instances under it, and the board "Notes templates — components" in
[visual-language.pen](visual-language.pen). Spec:
[../spec/notes-templates/SPEC.md](../spec/notes-templates/SPEC.md); what
Daily writes is [../spec/daily-notes/SPEC.md](../spec/daily-notes/SPEC.md).

## Notes bar

- The first line of the summary is the notes bar. Left: «Шаблон: <name>»
  (`gutter`, `type-caption`). Right: the Сохранять прежние check box and the
  Сделать заново pull-down button (`btn`, `chip` while open).
- Сделать заново opens a menu headed ШАБЛОН that lists every template; the
  check marks the template of the shown notes. Choosing any template, the
  checked one included, makes the notes again with it.
- Сохранять прежние is one choice for every call, on by default. It is the
  only control for keeping; it does not choose a template.
- Копировать stays alone in the summary's top-right corner.
- A call without notes shows «Нет итогов» and a Сделать pull-down with the
  same menu, and no check box.

## Broken templates

- A template whose file cannot be used stays listed, disabled (`disText`),
  with its reason under it in `rec`, `type-caption`. The menu then adds
  Открыть папку шаблонов, which opens the folder in Finder.
- When no file is usable, Default (built in) stays enabled; one disabled
  line, «Файлы шаблонов», says why the files cannot be used.

## Which template, and Previous / Current

- The notes bar names the template; the date line under the notes
  repeats it. Notes made
  before templates read Default.
- When a previous set is kept, the bar leads with a Предыдущие / Текущие
  segmented control; Текущие is selected after new notes.

## Making notes again

- The shown notes stay, at half opacity, under a «Делаю заново · <name>…»
  line on `okBg` with Отменить.
- Cancelling returns to the notes as they were; that is "Calls — regenerate
  menu" without the menu, so it has no frame of its own.
- A failure shows Banner/Error above the unchanged notes: «Не удалось
  сделать итоги заново» and the reason.

## States

| Frame | What it shows |
|---|---|
| Calls — regenerate menu | Notes by Default, Сделать заново open, keep on |
| Calls — generate menu, no notes | «Нет итогов» and Сделать open; no check box |
| Calls — regenerate menu, broken template | Daily disabled with its reason; Открыть папку шаблонов |
| Calls — regenerate menu, no usable files | Only Default enabled; why the files cannot be used |
| Calls — notes kept, current | Предыдущие / Текущие, Текущие selected, Шаблон: Daily |
| Calls — remaking notes | Old notes dimmed under the making line |
| Calls — remake failed | Error banner over the kept notes |

Open: a keyboard shortcut for Сделать заново.
