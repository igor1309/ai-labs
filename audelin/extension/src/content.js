// Runs in every Telemost page: reads the page after each change and passes
// the resulting events to the background worker, which forwards them to the
// app. The call is the room number in the page's address, read at each change,
// since Telemost moves into a call from its other pages without loading a new
// document.
import { createCallObserver } from "./observer.js";
import { roomOf } from "./room.js";
import { createRosterReader } from "./roster.js";

// The room of the call the page last showed: the events that end a call come
// after the address has left it.
let callId = null;

let nextTile = 0;
const observe = createCallObserver({
  readRoster: createRosterReader({
    newId: () => `telemost-tile-${++nextTile}`,
    afterStyle: (element) => getComputedStyle(element, "::after"),
  }),
  now: () => performance.timeOrigin + performance.now(),
  emit: (event) => {
    if (callId) chrome.runtime.sendMessage({ callId, event }).catch(() => {});
  },
});

// While the address names a room, hold a port to the worker, which keeps the
// worker's link to the app open. The browser drops the port when it stops the
// worker; holding again restarts it.
let link = null;
function holdLink() {
  if (link || !roomOf(location.pathname)) return;
  try {
    const port = chrome.runtime.connect({ name: "telemost-call" });
    link = port;
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (link !== port) return;
      link = null;
      setTimeout(holdLink, 1000);
    });
  } catch {
    // The extension was reloaded; this page's script is orphaned.
  }
}

function releaseLink() {
  const port = link;
  link = null;
  port?.disconnect();
}

function read() {
  const room = roomOf(location.pathname);
  if (room) callId = room;
  observe(document);
  if (room) holdLink();
  else releaseLink();
}

// Many mutations arrive together; one read follows each burst.
let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    read();
  }, 0);
}

new MutationObserver(schedule).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
});
schedule();
