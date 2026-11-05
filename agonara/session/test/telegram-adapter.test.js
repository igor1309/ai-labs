import assert from "node:assert/strict";
import { test } from "node:test";
import { keyboard, markdownToHtml, parseCallback, render } from "../src/telegram-adapter.js";

const labels = (markup) => markup.inline_keyboard.map((row) => row.map((button) => button.text));

test("a screen renders a bold title, the body and numbered lists with bold headings", () => {
  const { text } = render({
    title: "Тема 3", body: "About <ethics> & more.",
    lists: [
      { heading: "Concepts", entries: [{ index: 0, n: 1, label: "Власть" }, { index: 2, n: 2, label: "Секреты" }] },
      { heading: "Materials", entries: [{ index: 1, label: "Лекция" }] },
    ],
  }, [], 1);
  assert.equal(text, "<b>Тема 3</b>\n\nAbout &lt;ethics&gt; &amp; more.\n\n<b>Concepts</b>\n1. Власть\n2. Секреты\n\n<b>Materials</b>\n📖 Лекция");
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
    ["📖 Тема 3. Этические проблемы в де…"],
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
