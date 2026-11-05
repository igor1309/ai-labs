import { keyboard, parseCallback, splitText } from "./telegram-adapter.js";

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
  if (callback) await api("answerCallbackQuery", { callback_query_id: callback.id });
  await sendView(api, chatId, result);
  return { ...state, session: result.session };
}

async function sendView(api, chatId, { session, content, actions }) {
  const chunks = splitText(content);
  for (const [index, text] of chunks.entries()) {
    const last = index === chunks.length - 1;
    await api("sendMessage", {
      chat_id: chatId,
      text,
      ...(last ? { reply_markup: keyboard(actions, session.step) } : {}),
    });
  }
}
