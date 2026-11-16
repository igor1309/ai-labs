// Runs in a Telemost call page: reads the page after each change and passes
// the resulting events to the background worker, which forwards them to the
// app. The call is the room number in the page's address.
import { createCallObserver } from "./observer.js";
import { createRosterReader } from "./roster.js";

const callId = location.pathname.match(/^\/j\/([0-9]{14})/)?.[1];

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

// Hold the worker's link to the app while this call page is open. The
// browser drops the port when it stops the worker; holding again restarts it.
function holdLink() {
  if (!callId) return;
  try {
    chrome.runtime.connect({ name: "telemost-call" }).onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      setTimeout(holdLink, 1000);
    });
  } catch {
    // The extension was reloaded; this page's script is orphaned.
  }
}
holdLink();

// Many mutations arrive together; one read follows each burst.
let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    observe(document);
  }, 0);
}

new MutationObserver(schedule).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
});
schedule();
