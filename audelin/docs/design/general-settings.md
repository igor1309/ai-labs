# General settings: language and appearance

Settings opens on a General tab («Основные»), before Recording and Call
summaries. Language and Appearance are two rows of one grouped card, in
the System Settings style: the title and the grey hint on the left, a
pop-up button with the current choice on the right. The button opens a
native menu of three choices:

| Row | Russian | English | Options |
|---|---|---|---|
| Language | Язык | Language | Системный / System, Русский, English |
| Appearance | Оформление | Appearance | Системное / System, Светлое / Light, Тёмное / Dark |

Language names are written in their own language in both UIs, as macOS
does. The frames are in Screen 6, "General — light" and "General — dark".

## Language

- System uses the first macOS preferred language Audelin supports. When
  macOS prefers a language Audelin does not have, the UI is English.
- Русский and English force that language whatever macOS prefers.
- A change applies at once to every window, the live panel and the menu
  bar, with no relaunch and no confirmation.
- The grey line under the title says what System gives now: the macOS
  language, or English when the macOS language is not supported. When a
  language is forced, it names the macOS language instead.
- Language covers UI text only. Transcription, its language hint,
  summaries and call folder names do not change.

## Appearance

- System follows the macOS appearance; Light and Dark force it on every
  window, the live panel and the menu bar UI. The choice is saved with the
  other preferences, is System until chosen and applies at once.
- The grey line says what the choice gives: «Как в macOS.» / "As in
  macOS." under System, «Всегда светлое, что бы ни было в macOS.» /
  "Always light, whatever macOS uses." under Light, and the same with
  тёмное / dark under Dark.
- Only System is drawn selected; Light and Dark selected are not drawn.

## AGENTS.md for AI agents

While the recordings root has no `AGENTS.md`, General shows a third row,
«Для ИИ-агентов» / "For AI agents", under Appearance. It is a Settings row
under the card, whose control holds:

- "Нет файла AGENTS.md" / "No AGENTS.md file" in `text`, weight 600;
- a hint in `gutter` at `type-small`: «Он объясняет ИИ-агенту, как устроена
  папка звонков: где расшифровка, заметки и теги. Audelin не создаёт его
  сам.» / "It explains the calls folder to an AI agent: where the
  transcript, notes and tags are. Audelin doesn't create it on its own.";
- Button/Secondary «Создать AGENTS.md» / "Create AGENTS.md", which writes the
  file to the recordings root.

Audelin never writes the file on its own. Once the file exists, the row is
hidden. The frames are "general-agents-missing-light" and its dark instance.

When writing fails, the row stays and the hint says why (`../spec/agents-file/SPEC.md`).

## Pop-up button

- At rest the button shows the value in `text` at `type-small` and, after
  it, a `chevrons-up-down` icon on a small `chip` with `radius-control`;
  the button itself has no background.
- On hover the whole button takes the `chip` fill with `radius-control`,
  and the chevrons lose their own chip.
- The menu is the native macOS menu, with a checkmark on the current
  choice.
- The card is `card` with `radius-card`; a `rule` line, inset 12 pt, sits
  between the rows. The grey hint reaches 4.5:1 on the card.

## Input

- Mouse: a click opens the menu; a click on an item chooses it.
- Keyboard: Tab reaches the button with the native focus ring; Space opens
  the menu, the arrow keys move, Return chooses and Escape closes.
- macOS only; there is no phone or tablet layout.

## States

| Frame | UI language | Selected | macOS language |
|---|---|---|---|
| general-system | Russian | System | Russian |
| general-fallback | English | System | German |
| general-english | English | English | Russian |
| general-russian | Russian | Русский | English |
| general-hover | English | System | German; the pointer is over the Language button |
| general-agents-missing | Russian | System | Russian; no AGENTS.md in the recordings root |

Each light frame is a component; its dark frame is an instance with
`theme: {mode: "dark"}`.
