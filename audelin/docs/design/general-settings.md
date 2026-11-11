# General settings: language and appearance

Settings opens on a General tab («Основные»), before Recording and Call
summaries. It holds two rows, each a three-part segmented control that
spans the row:

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
- The grey line under the picker says what System gives now: the macOS
  language, or English when the macOS language is not supported. When a
  language is forced, it names the macOS language instead.
- Language covers UI text only. Transcription, its language hint,
  summaries and call folder names do not change.

## Appearance

- System follows the macOS appearance; Light and Dark force it. The grey
  line under System says «Как в macOS.» / "As in macOS.".
- Only System is drawn selected. Light and Dark selected, and how a forced
  appearance reaches the panel and menu bar, are open.

## Input

- Mouse: a click on a segment selects it.
- Keyboard: Tab reaches the picker; the arrow keys move between segments.
- macOS only; there is no phone or tablet layout.

## States

| Frame | UI language | Selected | macOS language |
|---|---|---|---|
| general-system | Russian | System | Russian |
| general-fallback | English | System | German |
| general-english | English | English | Russian |
| general-russian | Russian | Русский | English |

Each light frame is a component; its dark frame is an instance with
`theme: {mode: "dark"}`.
