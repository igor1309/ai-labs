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

- System follows the macOS appearance; Light and Dark force it on every
  window, the live panel and the menu bar UI. The choice is saved with the
  other preferences, is System until chosen and applies at once.
- The grey line says what the choice gives: «Как в macOS.» / "As in
  macOS." under System, «Всегда светлое, что бы ни было в macOS.» /
  "Always light, whatever macOS uses." under Light, and the same with
  тёмное / dark under Dark.
- Only System is drawn selected; Light and Dark selected are not drawn.

## Segmented control

Settings has one segmented control, in the native macOS style and one
size: the tab bar, Language, Appearance and the debug chunk size use it.

- A `segTrack` track with `radius-control` holds equal segments, 2 pt
  apart and 2 pt in from its edge.
- The selected segment is a `segThumb` chip with `radius-thumb` and a
  `segShadow` shadow; its label is medium weight. Every label is `text`.
- No outlines and no ring around the control. Keyboard focus is a 2 pt
  `me` ring outside the selected segment.
- The grey hint line under a picker reaches 4.5:1 on the window.

## Input

- Mouse: a click on a segment selects it.
- Keyboard: Tab reaches the picker and rings its selected segment; the
  arrow keys move between segments.
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
