# Session web page: design brief, round 2

Round 1 was drawn with short invented titles. The page built from it broke
as soon as it showed real data. This brief starts from the real data. Every
title and count below comes from the live program on 2026-11-05. **Draw with
these strings, not shorter ones.** A frame that only works with a two-word
title has failed.

## Who reads it, and where

One reader is studying a professional retraining program (1840 hours, in
Russian). They read a lecture in short sittings: on an iPhone on the go, or
on a laptop at a desk. They ask for help on one paragraph at a time: "Расскажи
подробнее", "Объясни проще" or "Приведи пример". When they come back, they
want to continue where they stopped.

## What the real data looks like

### Program titles are long and repeat

- "1840 Практическая психология с дополнительной специализацией в области
  применения психотерапевтических технологий" is 108 characters. Two
  programs have this exact title. One has 10 topics and the other has 0.
- Test programs sit in the same list, e.g. "Evaluator smoke 9ca3e4e3".

**The design must:** tell apart two programs with the same title by their
counts (10 тем vs пусто). Empty programs go to the bottom or get dimmed, and
are never shown as equals.

### "Courses" are really topics, and their order is a mess

The API returns topics in this order: Тема 2, Тема 3, Тема 5, Тема 9,
Тема 4, Тема 7, Модуль 1, Тема 8, Тема 1, Тема 6. A module sits among its
own topics. Each title already carries its number ("Тема 3."), so a second
number in front of it ("02") disagrees with it.

Typical titles run 60–90 characters:

- "Тема 7. Профессиональное выгорание, профессиональная деформация и
  деструкция психолога-практика"
- "Модуль 1. Введение в профессию. Профессиональная этика в работе психолога"

**The design must:**

- Sort by the number in the title: Модуль, then its Темы. Never print our
  own index next to a number the title already has.
- Show "Тема 7" as a short label and the rest as the name. The name gets one
  line and is cut with an ellipsis in lists. It is shown in full on its own
  page.

### Concepts come by the dozen

Topics link to 9–37 concepts. Each concept is a phrase of up to 70
characters, e.g. "Протоколы информированного согласия как условие научной
публикации". Round 1 showed the first 4 and then "и ещё 33". That is still a
wall of text, and it hides the useful part.

**The design must:** show the concept count in a topic's row ("37 понятий")
and nothing more. The concepts open on demand, as the niidpo pages fold 198
terms behind one "термины" summary.

### Most topics have nothing to read

Only 4 of the 10 topics have a material. The other 6 say "Материалов пока
нет".

All 10 topics, in API order, with concept count and whether there is
something to read:

| Topic | Concepts | Material |
|---|---|---|
| Тема 2. Система ценностей и основной этический ориентир психолога | 9 | yes |
| Тема 3. Этические проблемы в деятельности практического психолога | 20 | yes, read up to §1 · 6/10 |
| Тема 5. Моральные дилеммы в деятельности практического психолога | 23 | no |
| Тема 9. Этика научных психологических исследований | 37 | no |
| Тема 4. Этические принципы и нормы в деятельности психолога | 17 | no |
| Тема 7. Профессиональное выгорание, профессиональная деформация и деструкция психолога-практика | 28 | no |
| Модуль 1. Введение в профессию. Профессиональная этика в работе психолога | 2 | yes |
| Тема 8. Этика в психодиагностической работе | 37 | no |
| Тема 1. Общая и профессиональная этика | 12 | yes |
| Тема 6. Требования к морально-этическим и личностным качествам психолога | 25 | no |

**The design must:** make a topic with something to read obvious at a
glance, and keep the empty ones quiet: one dim line, with no button.

### A lecture has the same name as its topic

The only material in "Тема 3. Этические проблемы в деятельности практического
психолога" is also called "Тема 3. Этические проблемы в деятельности
практического психолога". The reading page printed that title five times. A
material can also be linked from two places ("Тема 3" and "Модуль 1").

**The design must:** print a title once per screen. When a material's title
equals its topic's title, show it as the topic itself. Choose one home for a
material linked twice.

### Sections and pages

The lecture has the sections Введение, §1 Личностные проблемы психолога,
§2 Межличностные проблемы при взаимодействии психолога с клиентом and §3
Методические проблемы в деятельности психолога. Each section spans several
pages ("Введение · 1/2").

### Paragraphs are long, and lists are paragraphs

Real paragraph 2 is a single line of nine problems separated by semicolons,
about 300 characters long. Numbered lists have items as long as paragraphs.
An item numbered "1." sits right next to our own paragraph number "1".

The real first page of Введение, verbatim:

> Студенческий текст по теме 3: личностные, межличностные и методические
> этические проблемы в деятельности практического психолога.
>
> Цель: сформировать представление об этических проблемах, с которыми чаще
> всего приходится сталкиваться практическому психологу.
>
> Личностные проблемы психолога: власть; самокрасование; ответственность;
> проблема близких отношений с клиентом; недостаточная личностная зрелость
> психолога; отсутствие необходимой теоретической и методической подготовки;
> личностная проработанность психолога; разочарование психолога в своей
> деятельности; работоголизм.
>
> Межличностные проблемы при взаимодействии с клиентом: поддержка
> «неблаговидных дел» клиента; поиск «своего клиента» или «своего
> психолога»; «позднее прозрение» клиента; скучный клиент; неверие в
> возможности клиента.

**The design must:** carry no visible paragraph numbers. The paragraph the
reader asks about is shown by highlighting it, not by a number.

## What broke in round 1 (the reader's screenshots)

1. **iPhone, answer card:** the header squeezed "к абзацу 1" into a narrow
   column, one word per line.
2. **Desktop, the "1" in the margin:** the reader couldn't tell what it was.
   It clashed with list numbering.
3. **Desktop, ⋯:** it jumped from the right margin to the left one when it
   became active.
4. **Sidebar:** four levels of indent (program, topic, a lecture with the
   same name, sections), with long titles wrapping onto two or three lines.
5. **Program page:** walls of concepts, and the "Продолжить чтение" bar
   covered the text under it.

## Look: keep ours

Round 1's visual language stays: its palette, type and components, as
in `session-web.pen` and `internal/web/static/app.css`. This round fixes
**layout and consistency**, not the look. Borrow structure from the
references below, never their colours or fonts.

- Light: paper #FBF7F0, paper-deep #F3ECE0, sunken #EFE7D9, line #E6DDCE,
  line-strong #CFC4B2, ink #231F1A, accent #33408F, accent-soft #E9EBF6,
  highlight #FAEDC6.
- Dark: paper #1B1815, paper-deep #211D19, sunken #26221E, line #322C26,
  line-strong #4A433C, ink #EDE6DA, accent #929CEB, accent-soft #23284A,
  highlight #372D1F.
- Type: Source Serif 4 for reading, Inter for UI. Body text 17px, column
  680px. Radii 8, 14 and 20.

**Consistency:** one row style for every list (programs, topics, sidebar),
one control style for each action wherever it appears, the same spacing
scale throughout, and the same name for each thing on every screen.

## Reference: structure that works elsewhere

**bb and Multica sidebars:**

- Every row is one line, truncated with an ellipsis, with the full title in a
  tooltip.
- Indent is at most one level. Hierarchy is shown with group headers, not
  ever-deeper indents.
- Rows carry a small icon on the left and a dim count or status on the right.
- Groups collapse, and only the current group is open.

**The niidpo pages** (`погружение.html`, `погружение-в-курс.html`,
`библиотека-вебинаров.html`):

- Each page opens as a folded map. A topic row shows a number, the title and
  a one-line hook ("Зачем психологу неврология и где кончается норма.").
  Its body, terms and sources open with `<details>`.
- A large count stays a count ("198 терминов", "794 термина") until opened.
- A top tally gives the size of things: "11 тем · 3 модуля · 198 терминов".
- The text column is narrow (about 43–58rem). At 34rem and below, it switches
  to one column with 17px text, and tap targets are at least 40px.

## Screens to draw

Each screen needs a phone frame (390pt) and a desktop frame (1440px).

1. **Programs:** both "1840 …" programs and the smoke-test program.
2. **Program:** all 10 topics in real order, with:
   - "Тема 9" (37 понятий, no materials);
   - "Тема 3" (20 понятий, one lecture, read up to §1 · 6/10);
   - the "Продолжить чтение" entry, which must not cover content.
3. **Reading:** the lecture page "Введение · 1/2", with:
   - the real 300-character paragraph 2;
   - a numbered list whose items are long;
   - prev/next between pages and sections.
4. **Reading with sidebar (desktop):** the sidebar at full real length.
   Every topic row is one line. Тема 3 is open and shows its four sections,
   with the current one marked.
5. **Asking about a paragraph:**
   - **Desktop:** the action control stays in one place. Pick a side and
     keep it there.
   - **Phone:** the answer opens as a full-width bottom sheet. Its header is
     one line ("Объясни проще") with the quoted paragraph's first line under
     it, never a narrow column.
   - Draw the states: loading, a real answer of about 1,200 characters, and
     an error.
6. **States:**
   - an empty program;
   - a topic with no materials;
   - Agonara unreachable;
   - an expired link (no token).

## Rules for every frame

- Use real strings only. Before handing off, check each frame with the
  longest title in this brief.
- Text never wraps one word per line. A header that can't fit moves above
  its content.
- Controls never move when they change state.
- Nothing fixed on screen covers reading text. Reserve the space for it, or
  scroll it with the page.
- Show one level of indent. Deeper structure goes into headers, counts or
  disclosure.

## Out of scope

- Real answers: the answer API stays a stub until a model is chosen.
- Editing, search and accounts.
