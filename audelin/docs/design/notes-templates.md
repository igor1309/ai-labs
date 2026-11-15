# Notes templates — brief

Frames: the row "Calls — regenerate menu …" below the merge outcomes, its
dark instances under it, and the board "Notes templates — components" in
[visual-language.pen](visual-language.pen). Spec:
[../spec/notes-templates/SPEC.md](../spec/notes-templates/SPEC.md); what
Daily writes is [../spec/daily-notes/SPEC.md](../spec/daily-notes/SPEC.md).

## Regenerate menu

- Two icon buttons sit in the summary's top-right corner, fixed while the
  text scrolls: the regenerate menu button (SF Symbol
  `arrow.triangle.2.circlepath`; lucide `refresh-cw` stands in) and
  Копировать. A call without notes shows only the menu button.
- The menu has one section of buttons, headed СДЕЛАТЬ ЗАНОВО when the call
  has notes and СДЕЛАТЬ when it has none. Each button is a template;
  choosing one makes the notes with it. No template carries a check.
- The menu follows the native NSMenu: `type-body` items, a `type-caption`
  600 section header in `gutter`, a check column, and the highlighted item
  in the accent colour (`selBg`, `selText`).
- Below a separator, Сохранять прежние итоги is a check item for every
  call, on by default: on keeps the shown notes as Предыдущие, off
  overwrites them. A call without notes has no such item.

## Broken templates

- A template whose file cannot be used stays listed, disabled (`disText`),
  with its reason under it in `rec`, `type-caption`. The menu then adds
  Открыть папку шаблонов, which opens the folder in Finder.
- When no file is usable, Default (built in) stays enabled; one disabled
  line, «Файлы шаблонов», says why the files cannot be used.

## Which template, and Previous / Current

- A line above the summary reads «Шаблон: <name>» (`gutter`,
  `type-caption`); the date line under the notes repeats it. Notes made
  before templates read Default.
- When a previous set is kept, the line leads with a Предыдущие / Текущие
  segmented control that picks which set the summary shows; Текущие is
  selected after new notes. The template line and the date line follow the
  shown set.

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
| Calls — regenerate menu | Notes by Default, menu open, keep on |
| Calls — generate menu, no notes | Menu open with СДЕЛАТЬ; no keep item |
| Calls — regenerate menu, broken template | Daily disabled with its reason; Открыть папку шаблонов |
| Calls — regenerate menu, no usable files | Only Default enabled; why the files cannot be used |
| Calls — notes kept, current | Предыдущие / Текущие, Текущие selected, Шаблон: Daily |
| Calls — notes kept, previous | Предыдущие selected: the older notes, Шаблон: Default |
| Calls — remaking notes | Old notes dimmed under the making line |
| Calls — remake failed | Error banner over the kept notes |

Open: keyboard shortcuts for the menu's items.
