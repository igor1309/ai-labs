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

## Adapting to screens

The layout follows the window's width, not the device: an iPad in Split View
can be as narrow as a phone. Three widths:

| Width | Typical | Outline | Top | Prev / Next | Paragraph menu | Body |
| --- | --- | --- | --- | --- | --- | --- |
| Compact, < 600 | iPhone, narrow iPad split | Full-screen sheet from Contents | Back + title + Contents | Bar fixed at the bottom | Bottom sheet | 17 (`text-body`) |
| Medium, 600–1023 | iPad portrait, iPad landscape split | Drawer from the left, opened by Contents | Breadcrumb + Contents | Pager at the end of the page | Popover at the ⋯ | 19 (`text-lead`) |
| Wide, ≥ 1024 | iPad landscape, desktop | Sidebar 280, always shown | Breadcrumb + Contents | Pager at the end of the page | Popover at the ⋯ | 19 (`text-lead`) |

- **Reading column:** at most 680 wide and centred; side margins 16 compact,
  32 medium and wide. Text never runs wider than the column.
- **Program page:** one column of course cards at every width, in the same
  680 column. Continue reading is a bar fixed at the bottom on compact and
  a button under the program's title elsewhere.
- **Touch or mouse,** decided by the pointer, not the width: on touch the ⋯
  shows on every paragraph, muted; with a mouse the margin shows the
  paragraph number and the ⋯ appears on hover or keyboard focus. The
  paragraph whose menu or answer is open always shows its ⋯, filled. The tap
  target is 44 × 44 either way.
- **Keyboard:** the ⋯ is focusable; Enter or Space opens the menu, Escape
  closes it and returns focus to the ⋯. Arrow keys move between menu items.
- **The answer** opens inline under its paragraph at every width; the menu
  closes when it opens.
- **iPhone:** bars fixed at the bottom sit above the home indicator (safe
  area), and the bottom sheet does too.
- **Light and dark** follow the system setting.

The frames show all three: compact (iPhone, 375), medium (iPad portrait,
820 × 1180, with the menu as a popover and with the outline drawer open)
and wide (1280).

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
- **Components:** paragraphs (phone, wide, wide · active), Paragraph menu,
  Menu action, Course card, Inline answer, top bars (back, reading,
  desktop), pagers (phone, desktop) and outline rows (course, open course,
  section, active section). Frames are built from their instances.
- **Light and dark:** each light screen is itself a component; its dark
  frame is an instance in dark mode, so edit the light one only.

## Not in this brief

Login, progress and checks, search, settings, the answer's own
follow-up actions. They come later.

## Frames to draw

1. Phone: Program (courses list)
2. Phone: Content page with the paragraph menu open (bottom sheet)
3. Desktop: Content page with sidebar, an inline answer under one paragraph
