# Notes templates — brief

Frames: the row "Calls — template menu …" below the merge outcomes, its
dark instances under it, and the board "Notes templates — components" in
[visual-language.pen](visual-language.pen). Spec:
[../spec/notes-templates/SPEC.md](../spec/notes-templates/SPEC.md); what
Daily writes is [../spec/daily-notes/SPEC.md](../spec/daily-notes/SPEC.md).

## Template menu

- A menu button (template icon and chevron) sits left of Копировать in the
  summary's top-right corner, with the same fill, border and shadow. While
  its menu is open it takes the `chip` fill.
- The menu, in the context menu's style, 260 wide, holds: Сделать заново,
  which uses the template of the shown notes; a separator; one item per
  template with a check on the one that made the shown notes; a separator;
  Сохранять предыдущие итоги, a check item for every call, on by default.
- A call without notes shows only the template button. Its menu starts with
  Сделать итоги and has no keep item.

## Broken templates

- A template whose file cannot be used stays listed, disabled (`disText`),
  with its reason under it in `rec`, `type-caption`. The menu then adds
  Открыть папку шаблонов, which opens the folder in Finder.
- When no file is usable, Default (built in) stays enabled; one disabled
  line, «Файлы шаблонов», says why the files cannot be used.

## Which template, and Previous / Current

- A notes bar above the summary reads «Шаблон: <name>» (`gutter`,
  `type-caption`); the date line under the notes repeats it. Notes made
  before templates read Default.
- When a previous set is kept, the bar leads with a Предыдущие / Текущие
  segmented control; Текущие is selected after new notes.

## Making notes again

- The shown notes stay, at half opacity, under a «Делаю заново · <name>…»
  line on `okBg` with Отменить.
- Cancelling returns to the notes as they were; that is "Calls — template
  menu" without the menu, so it has no frame of its own.
- A failure shows Banner/Error above the unchanged notes: «Не удалось
  сделать итоги заново» and the reason.

## States

| Frame | What it shows |
|---|---|
| Calls — template menu | Notes by Default, menu open, keep on |
| Calls — template menu, no notes | No notes; menu without the keep item |
| Calls — template menu, broken template | Daily disabled with its reason; Открыть папку шаблонов |
| Calls — template menu, no usable files | Only Default enabled; why the files cannot be used |
| Calls — notes kept, current | Предыдущие / Текущие, Текущие selected, Шаблон: Daily |
| Calls — remaking notes | Old notes dimmed under the making line |
| Calls — remake failed | Error banner over the kept notes |

Open: a keyboard shortcut for Сделать заново.
