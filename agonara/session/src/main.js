import { handleUpdate } from "./bot.js";
import { createAgonaraClient } from "./agonara-client.js";
import { createProgramFlow, initialSession } from "./program-flow.js";
import { createStore } from "./store.js";

const token = process.env.BOT_TOKEN;
const allowedChatId = Number(process.env.CHAT_ID);
const statePath = process.env.SESSION_STATE_PATH;
const baseUrl = process.env.AGONARA_BASE_URL;
const login = process.env.AGONARA_LOGIN;
const password = process.env.AGONARA_PASSWORD;
if (!token || !allowedChatId || !statePath || !baseUrl || !login || !password) {
  console.error("BOT_TOKEN, CHAT_ID, SESSION_STATE_PATH, AGONARA_BASE_URL, AGONARA_LOGIN and AGONARA_PASSWORD are required");
  process.exit(1);
}

const log = (message) => console.log(`${new Date().toISOString()} ${message}`);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const client = createAgonaraClient({ baseUrl, login, password, fetch: globalThis.fetch });
// SESSION_PAGE_SIZE tunes how much text a lecture page holds for the phone.
const pageSize = Number(process.env.SESSION_PAGE_SIZE) || undefined;
const flow = createProgramFlow({ client, ...(pageSize ? { pageSize } : {}) });

async function api(method, params = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await response.json();
  if (!body.ok) {
    const error = new Error(`${method} failed: ${body.error_code} ${body.description}`);
    error.code = body.error_code;
    throw error;
  }
  return body.result;
}

const store = createStore(statePath, () => ({ offset: 0, session: initialSession() }));
let state = store.load();
const me = await api("getMe");
log(`started as @${me.username}, step ${state.session.step}, offset ${state.offset}`);

for (;;) {
  try {
    const updates = await api("getUpdates", {
      offset: state.offset,
      timeout: 25,
      allowed_updates: ["message", "callback_query"],
    });
    for (const update of updates) {
      log(`update ${update.update_id}`);
      state = await handleUpdate({ update, state, allowedChatId, api, flow, log });
      state = { ...state, offset: update.update_id + 1 };
      store.save(state);
    }
  } catch (error) {
    log(error.code === 409 ? `POLL CONFLICT: ${error.message}` : `ERROR: ${error.message}`);
    await wait(5000);
  }
}
