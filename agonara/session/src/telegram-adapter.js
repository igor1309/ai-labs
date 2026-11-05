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
