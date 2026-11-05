import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { handleUpdate } from "../src/bot.js";
import { initialSession } from "../src/program-flow.js";
import { createStore } from "../src/store.js";
import { TELEGRAM_TEXT_LIMIT, splitText } from "../src/telegram-adapter.js";

const CHAT = 1;
const makeState = () => ({ offset: 0, session: initialSession() });
const makeApi = (fail = {}) => {
  const calls = [];
  return { calls, api: async (method, params) => {
    calls.push({ method, params });
    if (fail[method]) throw new Error(fail[method]);
  } };
};
// A chat that refuses rich messages, as an older Telegram server would.
const RICH_REFUSED = "400 Bad Request: rich messages are not supported";
const makePlainApi = () => {
  const calls = [];
  return { calls, api: async (method, params) => {
    calls.push({ method, params });
    if (params.rich_message) throw new Error(`${method} failed: ${RICH_REFUSED}`);
  } };
};
const press = (data, chat = CHAT, messageId = 7) => ({
  callback_query: { id: "cb", data, message: { message_id: messageId, chat: { id: chat } } },
});
const makeFlow = (body = "Study algebra.") => async (session) => ({
  session: { ...session, step: session.step + 1 },
  view: { title: "Programs", body, lists: [] },
  actions: [{ id: "open_0", kind: "item", label: "1" }],
});
const send = (api, update, state = makeState(), flow = makeFlow(), log = () => {}) =>
  handleUpdate({ update, state, allowedChatId: CHAT, api, flow, log });

test("a message from the allowed chat gets the screen as one rich message", async () => {
  const { calls, api } = makeApi();
  await send(api, { message: { chat: { id: CHAT }, text: "hi" } });
  assert.deepEqual(calls.map((call) => call.method), ["sendRichMessage"]);
  assert.equal(calls[0].params.chat_id, CHAT);
  assert.equal(calls[0].params.rich_message.html, "<h2>Programs</h2><p>Study algebra.</p>");
});

test("a chat that refuses rich messages gets the plain screen with buttons, and the refusal is logged", async () => {
  const { calls, api } = makePlainApi();
  const logged = [];
  await send(api, { message: { chat: { id: CHAT }, text: "hi" } }, makeState(), makeFlow(), (line) => logged.push(line));
  assert.deepEqual(calls.map((call) => call.method), ["sendRichMessage", "sendMessage"]);
  assert.equal(calls[1].params.parse_mode, "HTML");
  assert.equal(calls[1].params.text, "<b>Programs</b>\n\nStudy algebra.");
  assert.ok(calls[1].params.reply_markup.inline_keyboard.length > 0);
  assert.equal(logged.filter((line) => /rich messages are not supported/.test(line)).length, 1);
});

test("any other chat gets no reply and no state change", async () => {
  const { calls, api } = makeApi();
  const state = makeState();
  const flow = () => assert.fail("an unauthorized chat must not reach the flow");
  assert.equal(await send(api, { message: { chat: { id: 2 }, text: "hi" } }, state, flow), state);
  assert.equal(await send(api, press("0:open_0", 2), state, flow), state);
  assert.equal(calls.length, 0);
});

test("a current button advances the session and offers next-step buttons", async () => {
  const { calls, api } = makeApi();
  const flowCalls = [];
  const flow = async (...args) => { flowCalls.push(args); return makeFlow()(...args); };
  const previous = makeState();
  const state = await send(api, press("0:open_0"), previous, flow);
  assert.equal(state.session.step, 1);
  assert.deepEqual(flowCalls, [[previous.session, "open_0"]]);
  assert.deepEqual(calls.map((call) => call.method), ["answerCallbackQuery", "editMessageText"]);
  const edited = calls[1].params;
  assert.equal(edited.chat_id, CHAT);
  assert.equal(edited.message_id, 7);
  assert.equal(edited.rich_message.html, "<h2>Programs</h2><p>Study algebra.</p>");
});

test("an unchanged screen is not an error and sends nothing new", async () => {
  const { calls, api } = makeApi({ editMessageText: "editMessageText failed: 400 Bad Request: message is not modified" });
  const state = await send(api, press("0:open_0"));
  assert.equal(state.session.step, 1);
  assert.deepEqual(calls.map((call) => call.method), ["answerCallbackQuery", "editMessageText"]);
});

test("a message that cannot be edited gets the screen as a new message", async () => {
  const { calls, api } = makeApi({ editMessageText: "editMessageText failed: 400 Bad Request: message can't be edited" });
  const state = await send(api, press("0:open_0"));
  assert.equal(state.session.step, 1);
  assert.deepEqual(calls.map((call) => call.method), ["answerCallbackQuery", "editMessageText", "sendRichMessage"]);
  assert.ok(calls[2].params.rich_message.html);
});

test("without rich messages a button press edits the plain screen in place", async () => {
  const { calls, api } = makePlainApi();
  await send(api, press("0:open_0"));
  assert.deepEqual(calls.map((call) => call.method),
    ["answerCallbackQuery", "editMessageText", "sendRichMessage", "editMessageText"]);
  assert.equal(calls[3].params.parse_mode, "HTML");
  assert.equal(calls[3].params.reply_markup.inline_keyboard[0][0].callback_data, "1:open_0");
});

test("an old button is answered and changes nothing", async () => {
  const { calls, api } = makeApi();
  const state = { ...makeState(), session: { ...initialSession(), step: 3 } };
  const flow = () => assert.fail("an old button must not reach the flow");
  assert.equal(await send(api, press("1:open_0"), state, flow), state);
  assert.deepEqual(calls.map((call) => call.method), ["answerCallbackQuery"]);
  assert.match(calls[0].params.text, /out of date/);
});

test("markup Telegram cannot parse is sent again as plain text", async () => {
  const calls = [];
  const api = async (method, params) => {
    calls.push({ method, params });
    if (params.rich_message) throw new Error(`${method} failed: ${RICH_REFUSED}`);
    if (params.parse_mode) throw new Error("sendMessage failed: 400 Bad Request: can't parse entities");
  };
  const state = await send(api, { message: { chat: { id: CHAT }, text: "hi" } }, makeState(), makeFlow("a < b & c"));
  assert.equal(state.session.step, 1);
  assert.deepEqual(calls.map((call) => [call.method, call.params.parse_mode]), 
    [["sendRichMessage", undefined], ["sendMessage", "HTML"], ["sendMessage", undefined]]);
  assert.equal(calls[2].params.text, "Programs\n\na < b & c");
  assert.ok(calls[2].params.reply_markup);
});

test("a plain screen too long for one message arrives split and whole, with buttons only on its last part", async () => {
  const { calls, api } = makePlainApi();
  const body = [...Array.from({ length: 300 }, (_, i) => `Line ${i + 1} of the long reply.`), "END OF LONG REPLY"].join("\n");
  await send(api, press("0:open_0"), makeState(), makeFlow(body));
  assert.ok(!calls.some((call) => call.method === "editMessageText" && !call.params.rich_message));
  const sent = calls.filter((call) => call.method === "sendMessage");
  assert.ok(sent.length > 1);
  assert.ok(sent.every((call) => call.params.text.length <= TELEGRAM_TEXT_LIMIT));
  assert.match(sent.at(-1).params.text, /END OF LONG REPLY/);
  assert.ok(sent.slice(0, -1).every((call) => !call.params.reply_markup));
  assert.ok(sent.at(-1).params.reply_markup);
  assert.equal(sent.map((call) => call.params.text).join("\n"), `<b>Programs</b>\n\n${body}`);
});

test("a refreshed screen invalidates buttons from the earlier message", async () => {
  const { calls, api } = makeApi();
  const state = await send(api, { message: { chat: { id: CHAT }, text: "hi" } });
  assert.equal(state.session.step, 1);
  calls.length = 0;
  assert.equal(await send(api, press("0:open_0"), state), state);
  assert.deepEqual(calls.map((call) => call.method), ["answerCallbackQuery"]);
  assert.match(calls[0].params.text, /out of date/);
});

test("an invalid action is acknowledged without changing state", async () => {
  const { calls, api } = makeApi();
  const state = makeState();
  assert.equal(await send(api, press("0:open_99"), state, async () => null), state);
  assert.deepEqual(calls, [{
    method: "answerCallbackQuery", params: { callback_query_id: "cb", text: "Unknown action." },
  }]);
});

for (const [name, update] of [
  ["message", { message: { chat: { id: CHAT }, text: "hi" } }],
  ["callback", press("0:open_0")],
]) {
  test(`Agonara failure on a ${name} logs the error, keeps state and permits the next update`, async () => {
    const { calls, api } = makeApi();
    const logs = [];
    const state = makeState();
    const before = structuredClone(state);
    const flow = async () => { throw new Error("GET /programs failed (HTTP 503): request rejected"); };
    assert.equal(await send(api, update, state, flow, (line) => logs.push(line)), state);
    assert.deepEqual(state, before);
    assert.deepEqual(logs, ["ERROR: GET /programs failed (HTTP 503): request rejected"]);
    assert.deepEqual(calls.filter((call) => call.method === "sendMessage"), [{
      method: "sendMessage", params: {
        chat_id: CHAT, text: "Could not load Agonara: GET /programs failed (HTTP 503): request rejected",
      },
    }]);
    if (name === "callback") assert.equal(calls[0].method, "answerCallbackQuery");
    const next = await send(api, update, state);
    assert.equal(next.session.step, state.session.step + 1);
  });
}

test("text with no newline is still split within the limit, losing nothing", () => {
  const text = "x".repeat(TELEGRAM_TEXT_LIMIT * 2 + 5);
  const chunks = splitText(text);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => chunk.length <= TELEGRAM_TEXT_LIMIT));
});

test("a restart restores the saved session and offset", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "session-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "state.json");
  const empty = makeState;
  const saved = { offset: 9, session: {
    step: 2, screen: "entity", entityId: "entity-id",
    items: [{ id: "child-id", title: "Child", kind: "concept" }],
    history: [{ screen: "program", programId: "program-id", title: "Program" }],
  } };
  createStore(path, empty).save(saved);
  assert.deepEqual(createStore(path, empty).load(), saved);
});
