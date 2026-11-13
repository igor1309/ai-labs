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
