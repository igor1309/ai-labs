import assert from "node:assert/strict";
import { test } from "node:test";
import { keyboard, markdownToHtml, markdownToRich, parseCallback, positionLabel, render, renderRich } from "../src/telegram-adapter.js";

const labels = (markup) => markup.inline_keyboard.map((row) => row.map((button) => button.text));

test("a screen renders a bold title, the body and its lists, materials marked as their buttons are", () => {
  const { text } = render({
    title: "Тема 3", body: "About <ethics> & more.",
    lists: [
      { heading: "Materials", entries: [{ index: 1, label: "Лекция" }] },
      { heading: "Concepts", entries: [{ index: 0, n: 1, label: "Власть" }, { index: 2, n: 2, label: "Секреты" }] },
    ],
  }, [], 1);
  assert.equal(text, "<b>Тема 3</b>\n\nAbout &lt;ethics&gt; &amp; more.\n\n<b>Materials</b>\n📖 Read: Лекция\n\n<b>Concepts</b>\n1. Власть\n2. Секреты");
});

test("a list without a heading and an empty screen render without blank parts", () => {
  assert.equal(render({ title: "Programs", lists: [{ heading: null, entries: [{ n: 1, label: "A" }] }] }, [], 1).text,
    "<b>Programs</b>\n\n1. A");
  assert.equal(render({ title: "Programs", lists: [], empty: "No programs." }, [], 1).text,
    "<b>Programs</b>\n\nNo programs.");
});

test("a page shows its number under the title and its markdown as Telegram HTML", () => {
  const { text } = render({ title: "Notes", markdown: "# Ethics\n\nText.", lists: [], page: { index: 1, count: 4 } }, [], 1);
  assert.equal(text, "📖 <b>Notes</b>\n<i>Page 2 of 4</i>\n\n<b>Ethics</b>\n\nText.");
});

test("buttons: one row per material, numbers five to a row, then paging, then navigation", () => {
  const actions = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `open_${i}`, kind: "item", label: String(i + 1) })),
    { id: "open_7", kind: "material", label: "Тема 3. Этические проблемы в деятельности практического психолога" },
    { id: "prev", kind: "page", label: "◀ Prev" }, { id: "next", kind: "page", label: "Next ▶" },
    { id: "back", kind: "nav", label: "◀ Back" }, { id: "programs", kind: "nav", label: "Programs" },
  ];
  const markup = keyboard(actions, 4);
  assert.deepEqual(labels(markup), [
    ["📖 Read: Тема 3. Этические проблемы…"],
    ["1", "2", "3", "4", "5"], ["6", "7"],
    ["◀ Prev", "Next ▶"],
    ["◀ Back", "Programs"],
  ]);
  assert.equal(markup.inline_keyboard[0][0].callback_data, "4:open_7");
  assert.equal(markup.inline_keyboard[1][0].callback_data, "4:open_0");
});

test("rows with no buttons are left out", () => {
  assert.deepEqual(labels(keyboard([{ id: "programs", kind: "nav", label: "Programs" }], 1)), [["Programs"]]);
  assert.deepEqual(keyboard([], 1), { inline_keyboard: [] });
});

test("markdown converts headings, bold, italics, code, bullets, rules and links, escaping HTML", () => {
  assert.equal(markdownToHtml([
    "## Цель **важно**", "Text with **bold**, __bold__, *italic* and `code` & <tag>.",
    "- one", "  * two", "---", "[Link](https://example.com) stays as text.", "2 * 3 * 4 is not italic.",
  ].join("\n")), [
    "<b>Цель важно</b>", "Text with <b>bold</b>, <b>bold</b>, <i>italic</i> and <code>code</code> &amp; &lt;tag&gt;.",
    "• one", "  • two", "———", "Link stays as text.", "2 * 3 * 4 is not italic.",
  ].join("\n"));
});

test("a converted tag never spans a line break", () => {
  const html = markdownToHtml("**open\nclose**");
  assert.equal(html, "**open\nclose**");
});

test("callback data parses into the step and the action", () => {
  assert.deepEqual(parseCallback("12:open_3"), { step: 12, actionId: "open_3" });
  assert.equal(parseCallback("12:open-3"), null);
  assert.equal(parseCallback(undefined), null);
});

const link = (data, label) => `<tg-button type="callback_data" style="link" data="${data}">${label}</tg-button>`;
const button = (data, label) => `<tg-button type="callback_data" data="${data}">${label}</tg-button>`;

test("a rich screen makes each name tappable where it is written, and ends with its button rows", () => {
  const html = renderRich({
    title: "Тема 3", body: "About <ethics>\n& more.",
    lists: [
      { heading: "Materials", entries: [{ index: 1, label: "Лекция" }] },
      { heading: "Concepts", entries: [{ index: 0, n: 1, label: "Власть" }, { index: 2, n: 2, label: "Секреты" }] },
    ],
  }, [
    { id: "open_0", kind: "item", label: "1" }, { id: "open_1", kind: "material", label: "Лекция" },
    { id: "open_2", kind: "item", label: "2" },
    { id: "back", kind: "nav", label: "◀ Back" }, { id: "programs", kind: "nav", label: "Programs" },
  ], 5);
  assert.equal(html, [
    "<h2>Тема 3</h2><p>About &lt;ethics&gt;<br>&amp; more.</p>",
    `<h3>Materials</h3><ul><li>📖 ${link("5:open_1", "Лекция")}</li></ul>`,
    `<h3>Concepts</h3><ol><li>${link("5:open_0", "Власть")}</li><li>${link("5:open_2", "Секреты")}</li></ol>`,
    `<tg-button-row>${button("5:back", "◀ Back")}${button("5:programs", "Programs")}</tg-button-row>`,
  ].join(""));
});

test("a lecture page starts with where it is and ends with paging, then navigation", () => {
  const actions = [{ id: "next", kind: "page", label: "Next ▶" }, { id: "contents", kind: "page", label: "☰ Contents" },
    { id: "back", kind: "nav", label: "◀ Back" }];
  const view = { title: "Notes", markdown: "Text.", page: { index: 3, count: 9 },
    position: { section: 2, label: "B", index: 1, count: 4 } };
  assert.equal(renderRich(view, actions, 1),
    `<p><i>📖 §2 B · 2/4</i></p><p>Text.</p><tg-button-row>${button("1:next", "Next ▶")}`
    + `${button("1:contents", "☰ Contents")}</tg-button-row><tg-button-row>${button("1:back", "◀ Back")}</tg-button-row>`);
  assert.match(render(view, actions, 1).text, /^📖 <b>Notes<\/b>\n<i>§2 B · 2\/4<\/i>/);
  assert.equal(renderRich({ title: "Notes", markdown: "Text.", page: { index: 0, count: 1 },
    position: { section: null, label: null, index: 0, count: 1 } }, [], 1), "<h2>📖 Notes</h2><p>Text.</p>");
});

test("where a page is: the intro, a section, and a page within it", () => {
  assert.equal(positionLabel({ section: null, label: null, index: 0, count: 1 }), "Intro");
  assert.equal(positionLabel({ section: 3, label: "C", index: 0, count: 1 }), "§3 C");
  assert.equal(positionLabel({ section: 3, label: "C", index: 4, count: 6 }), "§3 C · 5/6");
});

test("a name with no action is written as plain text, and an empty screen says so", () => {
  assert.equal(renderRich({ title: "Programs", lists: [{ heading: null, entries: [{ index: 0, n: 1, label: "A" }] }] }, [], 1),
    "<h2>Programs</h2><ol><li>A</li></ol>");
  assert.equal(renderRich({ title: "Programs", lists: [], empty: "No programs." }, [], 1),
    "<h2>Programs</h2><p>No programs.</p>");
});

test("lecture markdown: headings, lists and paragraphs, with nothing collapsed", () => {
  assert.equal(markdownToRich([
    "# Lecture", "Goal: **know** it.", "1. one", "2. two", "## Part A", "Line one\nline two", "- x\n- y",
    "---", "Text & <tag>.",
  ].join("\n\n")), [
    "<h3>Lecture</h3><p>Goal: <b>know</b> it.</p><ol><li>one</li><li>two</li></ol>",
    "<h3>Part A</h3><p>Line one<br>line two</p><ul><li>x</li><li>y</li></ul><hr><p>Text &amp; &lt;tag&gt;.</p>",
  ].join(""));
});

test("the contents page lists the intro and each section to tap, marking where the reader is", () => {
  const html = renderRich({ title: "Notes", lists: [], contents: [
    { page: 0, n: null, label: "Intro", current: false }, { page: 2, n: 1, label: "A", current: true },
  ] }, [{ id: "sec_0", kind: "section", label: "Intro" }, { id: "sec_2", kind: "section", label: "A" },
    { id: "read", kind: "page", label: "📖 Continue reading" }], 4);
  assert.equal(html, `<h2>📖 Notes</h2><h3>Contents</h3><ul><li>${link("4:sec_0", "Intro")}</li>`
    + `<li>▸ §1 ${link("4:sec_2", "A")}</li></ul><tg-button-row>${button("4:read", "📖 Continue reading")}</tg-button-row>`);
});

test("lecture markdown: text beside a list in one paragraph keeps its order", () => {
  assert.equal(markdownToRich("Intro:\n- a\n- b\nAfter."), "<p>Intro:</p><ul><li>a</li><li>b</li></ul><p>After.</p>");
});
