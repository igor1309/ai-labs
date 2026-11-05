// Draws a session screen for Telegram on a phone: HTML text, numbered lists,
// number keys five to a row, one row per material, then paging and navigation.
export const TELEGRAM_TEXT_LIMIT = 4096;
export const NUMBERS_PER_ROW = 5;
export const MATERIAL_LABEL_LIMIT = 28;

export function render(view, actions, step) {
  const header = view.page
    ? `📖 <b>${escape(view.title)}</b>\n<i>Page ${view.page.index + 1} of ${view.page.count}</i>`
    : `<b>${escape(view.title)}</b>`;
  const parts = [header];
  if (view.body) parts.push(escape(view.body));
  if (view.markdown) parts.push(markdownToHtml(view.markdown));
  for (const list of view.lists ?? []) {
    const lines = list.entries.map((entry) =>
      (entry.n === undefined ? `📖 Read: ${escape(entry.label)}` : `${entry.n}. ${escape(entry.label)}`));
    parts.push([list.heading && `<b>${escape(list.heading)}</b>`, ...lines].filter(Boolean).join("\n"));
  }
  if (view.empty) parts.push(escape(view.empty));
  return { text: parts.join("\n\n"), reply_markup: keyboard(actions, step) };
}

export function keyboard(actions, step) {
  const button = (action, text = action.label) => ({ text, callback_data: `${step}:${action.id}` });
  const of = (kind) => actions.filter((action) => action.kind === kind);
  const rows = [
    ...of("material").map((action) => [button(action, `📖 Read: ${shorten(action.label, MATERIAL_LABEL_LIMIT)}`)]),
    ...chunk(of("item").map((action) => button(action)), NUMBERS_PER_ROW),
    of("page").map((action) => button(action)),
    of("nav").map((action) => button(action)),
  ];
  return { inline_keyboard: rows.filter((row) => row.length) };
}

export function parseCallback(data) {
  const match = /^(\d+):(\w+)$/.exec(data ?? "");
  return match ? { step: Number(match[1]), actionId: match[2] } : null;
}

export function splitText(text, limit = TELEGRAM_TEXT_LIMIT) {
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    const newline = rest.lastIndexOf("\n", limit);
    const cut = newline > 0 ? newline : limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(newline > 0 ? cut + 1 : cut);
  }
  chunks.push(rest);
  return chunks;
}

// Telegram's HTML allows a few tags only; markdown is converted line by line,
// so no tag spans a line break and a split at a newline never breaks a tag.
export function markdownToHtml(markdown) {
  return markdown.split("\n").map((raw) => {
    const heading = /^#{1,6}\s+(.*)$/.exec(raw);
    if (heading) return `<b>${inline(escape(heading[1].replace(/\*\*|__/g, "")))}</b>`;
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) return "———";
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(raw);
    if (bullet) return `${bullet[1]}• ${inline(escape(bullet[2]))}`;
    return inline(escape(raw));
  }).join("\n");
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<b>${a ?? b}</b>`)
    .replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

function escape(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shorten(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

function chunk(list, size) {
  const rows = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

// Rich messages (Bot API 10.1): one message per screen, names tappable where
// they are written, a lecture's sections collapsed, paging and navigation as
// button rows at the end.
export const RICH_TEXT_LIMIT = 32768;

export function renderRich(view, actions, step) {
  const ids = new Set(actions.map((action) => action.id));
  const tap = (id, label) => (ids.has(id)
    ? `<tg-button type="callback_data" style="link" data="${step}:${id}">${escape(label)}</tg-button>`
    : escape(label));
  const parts = [`<h2>${view.page ? "📖 " : ""}${escape(view.title)}</h2>`];
  if (view.page && view.page.count > 1) parts.push(`<p><i>Page ${view.page.index + 1} of ${view.page.count}</i></p>`);
  if (view.body) parts.push(paragraph(escape(view.body)));
  if (view.markdown) parts.push(markdownToRich(view.markdown));
  for (const list of view.lists ?? []) {
    const materials = list.entries.every((entry) => entry.n === undefined);
    const items = list.entries.map((entry) =>
      `<li>${materials ? "📖 " : ""}${tap(`open_${entry.index}`, entry.label)}</li>`).join("");
    if (list.heading) parts.push(`<h3>${escape(list.heading)}</h3>`);
    parts.push(materials ? `<ul>${items}</ul>` : `<ol>${items}</ol>`);
  }
  if (view.empty) parts.push(paragraph(escape(view.empty)));
  for (const kind of ["page", "nav"]) {
    const row = actions.filter((action) => action.kind === kind)
      .map((action) => `<tg-button type="callback_data" data="${step}:${action.id}">${escape(action.label)}</tg-button>`);
    if (row.length) parts.push(`<tg-button-row>${row.join("")}</tg-button-row>`);
  }
  return parts.join("");
}

// Markdown as rich HTML: each heading below the top level opens a collapsed
// section that runs to the next heading; list runs become lists; other lines
// of a paragraph are joined with <br>.
export function markdownToRich(markdown) {
  const out = [];
  let open = false;
  const close = () => { if (open) out.push("</details>"); open = false; };
  // Items of one list are often parted by blank lines; keep them one list.
  const item = String.raw`[ \t]*(?:[-*+]|\d+[.)])[ \t]+`;
  const joined = markdown.trim().replace(new RegExp(`(^${item}.*)\\n{2,}(?=${item})`, "gm"), "$1\n");
  for (const block of joined.split(/\n{2,}/)) {
    const lines = block.split("\n");
    const heading = lines.length === 1 && /^(#{1,6})\s+(.*)$/.exec(lines[0]);
    if (heading) {
      close();
      const text = inline(escape(heading[2].replace(/\*\*|__/g, "")));
      if (heading[1].length === 1) out.push(`<h3>${text}</h3>`);
      else { out.push(`<details><summary>${text}</summary>`); open = true; }
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(block)) { out.push("<hr>"); continue; }
    out.push(richBlock(lines));
  }
  close();
  return out.join("");
}

function richBlock(lines) {
  const out = [];
  let list = null;
  let text = [];
  const flush = () => {
    if (text.length) out.push(paragraph(text.join("<br>")));
    text = [];
  };
  const end = () => { if (list) out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`); list = null; };
  for (const raw of lines) {
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(raw);
    const number = /^\s*(\d+)[.)]\s+(.*)$/.exec(raw);
    const tag = bullet ? "ul" : number ? "ol" : null;
    if (!tag) {
      end();
      text.push(inline(escape(raw)));
      continue;
    }
    flush();
    if (list?.tag !== tag) {
      end();
      list = { tag, items: [] };
    }
    list.items.push(`<li>${inline(escape(bullet ? bullet[1] : number[2]))}</li>`);
  }
  end();
  flush();
  return out.join("");
}

function paragraph(html) {
  return `<p>${html.replace(/\n/g, "<br>")}</p>`;
}
