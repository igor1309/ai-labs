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

## Look

Calm and readable: a reading app, not a dashboard. Use Agonara's palette: dark
text `#1c2329` on white `#ffffff`, muted text `#5e6a72`, muted surface
`#eef3f6`. Generous line height (1.6) and a serif or humanist body face.
Russian text must fit: content is mostly in Russian.

## Not in this brief

Login, progress and checks, search, dark mode, settings, the answer's own
follow-up actions. They come later.

## Frames to draw

1. Phone: Program (courses list)
2. Phone: Content page with the paragraph menu open (bottom sheet)
3. Desktop: Content page with sidebar, an inline answer under one paragraph
