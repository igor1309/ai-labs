import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { handleUpdate } from "../src/bot.js";
import { initialSession } from "../src/mock-session.js";
import { createStore } from "../src/store.js";
import { TELEGRAM_TEXT_LIMIT, splitText } from "../src/telegram-adapter.js";

const CHAT = 1;
const makeState = () => ({ offset: 0, session: initialSession() });
const makeApi = () => {
  const calls = [];
  return { calls, api: async (method, params) => calls.push({ method, params }) };
};
const press = (data, chat = CHAT) => ({
  callback_query: { id: "cb", data, message: { chat: { id: chat } } },
});
const send = (api, update, state = makeState()) =>
  handleUpdate({ update, state, allowedChatId: CHAT, api });

test("a message from the allowed chat gets the view with buttons", async () => {
  const { calls, api } = makeApi();
  await send(api, { message: { chat: { id: CHAT }, text: "hi" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.chat_id, CHAT);
  assert.ok(calls[0].params.reply_markup.inline_keyboard.length > 0);
});

test("any other chat gets no reply and no state change", async () => {
  const { calls, api } = makeApi();
  const state = makeState();
  assert.equal(await send(api, { message: { chat: { id: 2 }, text: "hi" } }, state), state);
  assert.equal(await send(api, press("0:dive_deeper", 2), state), state);
  assert.equal(calls.length, 0);
});

test("a current button advances the session and offers next-step buttons", async () => {
  const { calls, api } = makeApi();
  const state = await send(api, press("0:dive_deeper"));
  assert.equal(state.session.step, 1);
  assert.equal(state.session.depth, 1);
  const sent = calls.find((call) => call.method === "sendMessage");
  assert.equal(sent.params.reply_markup.inline_keyboard[0][0].callback_data, "1:explain_simpler");
});

test("an old button is answered and changes nothing", async () => {
  const { calls, api } = makeApi();
  const state = { ...makeState(), session: { ...initialSession(), step: 3 } };
  assert.equal(await send(api, press("1:dive_deeper"), state), state);
  assert.deepEqual(calls.map((call) => call.method), ["answerCallbackQuery"]);
});

test("a long reply arrives split and whole, with buttons only on its last part", async () => {
  const { calls, api } = makeApi();
  await send(api, press("0:long_reply"));
  const sent = calls.filter((call) => call.method === "sendMessage");
  assert.ok(sent.length > 1);
  assert.ok(sent.every((call) => call.params.text.length <= TELEGRAM_TEXT_LIMIT));
  assert.match(sent.at(-1).params.text, /END OF LONG REPLY/);
  assert.ok(sent.slice(0, -1).every((call) => !call.params.reply_markup));
  assert.ok(sent.at(-1).params.reply_markup);
});

test("text with no newline is still split within the limit, losing nothing", () => {
  const text = "x".repeat(TELEGRAM_TEXT_LIMIT * 2 + 5);
  const chunks = splitText(text);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => chunk.length <= TELEGRAM_TEXT_LIMIT));
});

test("a restart restores the saved session and offset", () => {
  const path = join(mkdtempSync(join(tmpdir(), "session-")), "state.json");
  const empty = makeState;
  const saved = { offset: 9, session: { step: 2, depth: 1, lastContent: "x" } };
  createStore(path, empty).save(saved);
  assert.deepEqual(createStore(path, empty).load(), saved);
});
