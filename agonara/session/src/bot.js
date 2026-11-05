import { RICH_TEXT_LIMIT, TELEGRAM_TEXT_LIMIT, parseCallback, render, renderRich, splitText } from "./telegram-adapter.js";

// Handles one update. `api(method, params)` is injected so tests need no network.
export async function handleUpdate({ update, state, allowedChatId, api, flow, log }) {
  const callback = update.callback_query;
  const chatId = update.message?.chat.id ?? callback?.message?.chat.id;
  if (chatId !== allowedChatId) return state;

  if (!update.message && !callback) return state;

  const parsed = callback && parseCallback(callback.data);
  if (callback && (!parsed || parsed.step !== state.session.step)) {
    await api("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "That button is out of date. Use the latest message.",
    });
    return state;
  }
  let result;
  try {
    result = await flow(state.session, parsed?.actionId);
  } catch (error) {
    log(`ERROR: ${error.message}`);
    if (callback) {
      await api("answerCallbackQuery", { callback_query_id: callback.id, text: "Could not load Agonara." });
    }
    await api("sendMessage", { chat_id: chatId, text: `Could not load Agonara: ${error.message}` });
    return state;
  }
  if (!result) {
    await api("answerCallbackQuery", { callback_query_id: callback.id, text: "Unknown action." });
    return state;
  }
  log(`${parsed ? `tap ${parsed.actionId}` : "message"} -> ${result.session.screen}`
    + `${result.session.page === undefined ? "" : ` page ${result.session.page + 1}/${result.session.pageCount}`}`
    + `${result.session.contents ? " contents" : ""}`);
  if (callback) await api("answerCallbackQuery", { callback_query_id: callback.id });
  await show(api, chatId, callback?.message?.message_id, result, log);
  return { ...state, session: result.session };
}

// A screen is one rich message: a button press redraws its own message, a
// typed message gets a new one. If Telegram refuses the rich message, the
// screen goes out in the plain format instead.
async function show(api, chatId, messageId, result, log) {
  const html = renderRich(result.view, result.actions, result.session.step);
  if (html.length <= RICH_TEXT_LIMIT) {
    const rich_message = { html };
    if (messageId !== undefined) {
      try {
        await api("editMessageText", { chat_id: chatId, message_id: messageId, rich_message });
        return;
      } catch (error) {
        // Unchanged text is not an error; any other refusal (an old message, say)
        // falls back to a new message rather than failing the update.
        if (/message is not modified/.test(error.message)) return;
      }
    }
    try {
      await api("sendRichMessage", { chat_id: chatId, rich_message });
      return;
    } catch (error) {
      log(`rich message refused, sending plain: ${error.message}`);
    }
  }
  await showPlain(api, chatId, messageId, result);
}

// The format before rich messages: HTML text with an inline keyboard.
async function showPlain(api, chatId, messageId, { session, view, actions }) {
  const { text, reply_markup } = render(view, actions, session.step);
  if (messageId !== undefined && text.length <= TELEGRAM_TEXT_LIMIT) {
    try {
      await api("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup });
      return;
    } catch (error) {
      if (/message is not modified/.test(error.message)) return;
    }
  }
  try {
    await send(api, chatId, text, reply_markup, "HTML");
  } catch (error) {
    // Markup Telegram cannot parse must not stall the update: send it plain.
    if (!/can't parse entities/.test(error.message)) throw error;
    await send(api, chatId, plain(text), reply_markup);
  }
}

async function send(api, chatId, text, reply_markup, parse_mode) {
  const chunks = splitText(text);
  for (const [index, chunk] of chunks.entries()) {
    const last = index === chunks.length - 1;
    await api("sendMessage", {
      chat_id: chatId, text: chunk, ...(parse_mode ? { parse_mode } : {}), ...(last ? { reply_markup } : {}),
    });
  }
}

function plain(html) {
  return html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
