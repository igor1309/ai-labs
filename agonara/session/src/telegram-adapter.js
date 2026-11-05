// Turns session content and actions into Telegram messages and buttons.
export const TELEGRAM_TEXT_LIMIT = 4096;

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

export function keyboard(actions, step) {
  return {
    inline_keyboard: actions.map((action) => [
      { text: action.label, callback_data: `${step}:${action.id}` },
    ]),
  };
}

export function parseCallback(data) {
  const match = /^(\d+):(\w+)$/.exec(data ?? "");
  return match ? { step: Number(match[1]), actionId: match[2] } : null;
}
