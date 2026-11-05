import { applyAction, view } from "./mock-session.js";
import { keyboard, parseCallback, splitText } from "./telegram-adapter.js";

// Handles one update. `api(method, params)` is injected so tests need no network.
export async function handleUpdate({ update, state, allowedChatId, api }) {
  const callback = update.callback_query;
  const chatId = update.message?.chat.id ?? callback?.message?.chat.id;
  if (chatId !== allowedChatId) return state;

  if (update.message) {
    await sendView(api, chatId, state.session);
    return state;
  }
  if (!callback) return state;

  const parsed = parseCallback(callback.data);
  if (!parsed || parsed.step !== state.session.step) {
    await api("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "That button is out of date. Use the latest message.",
    });
    return state;
  }
  const session = applyAction(state.session, parsed.actionId);
  if (!session) {
    await api("answerCallbackQuery", { callback_query_id: callback.id, text: "Unknown action." });
    return state;
  }
  await api("answerCallbackQuery", { callback_query_id: callback.id });
  await sendView(api, chatId, session);
  return { ...state, session };
}

async function sendView(api, chatId, session) {
  const { content, actions } = view(session);
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
