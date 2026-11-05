# Session web page: design brief

The Session probe today runs in Telegram. This page is its second surface: the
same session drawn on the web, for a phone first and a desktop second. It shows
content and the actions available; it decides nothing itself.

## What the page shows

Three levels, one page that changes with where the reader is:

1. **Programs:** the list of programs the student can see. Each is a title and
   one line of description.
2. **Program:** its courses (topics) in order, each with its concepts and
   materials. Materials are what you read and are marked as such.
3. **Content:** a lecture, read by sections. A header says where you are
   (program › course › section, *§2 · 3/6*), then the section text, then
   Previous, Next and Contents.

Back and a way home to Programs are always reachable.

## The paragraph menu

Each content paragraph has a small ellipsis (⋯) at its trailing edge. It is
quiet (muted, small) but its tap target is at least 44×44 pt. Tapping it opens
a context menu for that paragraph:

- Tell me more
- Explain simpler
- Give an example
- Ask a question…

The menu is a popover on desktop and a bottom sheet on a phone. The chosen
paragraph stays highlighted while the menu is open. The answer appears inline
under the paragraph, set apart from the lecture text, with a way to close it.

## Layout

- **Phone (375 pt):** one column. Breadcrumb collapses to Back + current title.
  Prev / Next sit in a bar at the bottom.
- **Desktop (1280 pt):** the program's outline (courses and sections) in a left
  sidebar; the reading column in the centre, about 680 pt wide.

## Look: Ink & Saffron

Warm paper for long reading, indigo ink for actions and the current place,
saffron for the paragraph the reader is working with. Light and dark.

| Role | Light |
| --- | --- |
| paper / paper-deep / sunken | `#FBF7F0` / `#F3ECE0` / `#EFE7D9` |
| line / line-strong | `#E6DDCE` / `#CFC4B2` |
| ink / ink-2 / ink-3 | `#231F1A` / `#685E52` / `#968A7B` |
| accent / accent-soft / accent-line | `#33408F` / `#E9EBF6` / `#C3C9E8` |
| highlight (chosen paragraph) | `#FAEDC6` |

Dark values are in the palette frame of `session-web.pen`. Serif body
(Source Serif 4) at line height 1.6; Russian text must fit.

## Design system

`session-web.pen` holds the system the frames are built from:

- **Tokens:** the colours above (light and dark through one `mode` theme),
  fonts (`font-serif`, `font-sans`, `font-mono`), a type scale (`text-xs` 11,
  `text-sm` 13, `text-md` 15, `text-body` 17, `text-lead` 19, `text-title` 22,
  `text-heading` 30, `text-display` 40), spacing (`space-2xs` 2 to `space-3xl`
  32) and radii (`radius-xs` 2, `sm` 8, `md` 14, `lg` 20, `full`). The Tokens
  frame shows them all.
- **Components:** Paragraph (phone), Paragraph · wide and its active state
  (desktop), Menu action and Course card. Frames use instances of them.

## Not in this brief

Login, progress and checks, search, settings, the answer's own
follow-up actions. They come later.

## Frames to draw

1. Phone: Program (courses list)
2. Phone: Content page with the paragraph menu open (bottom sheet)
3. Desktop: Content page with sidebar, an inline answer under one paragraph
