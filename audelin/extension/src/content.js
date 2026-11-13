// Runs in a Telemost call page: reads the page after each change and passes
// the resulting events on. Until the channel to the app exists, events go to
// the console.
import { createCallObserver } from "./observer.js";
import { createRosterReader } from "./roster.js";

let nextTile = 0;
const observe = createCallObserver({
  readRoster: createRosterReader({
    newId: () => `telemost-tile-${++nextTile}`,
    afterStyle: (element) => getComputedStyle(element, "::after"),
  }),
  now: () => performance.timeOrigin + performance.now(),
  emit: (event) => console.debug("audelin", event),
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
