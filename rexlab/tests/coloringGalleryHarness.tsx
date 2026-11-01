export { explorerProbes } from "./triceratopsExplorerProbes.ts";
export { stegosaurusExplorerProbes } from "./stegosaurusExplorerProbes.ts";
export { STEGOSAURUS } from "../src/coloring/geometry.ts";
export { STEGOSAURUS_EXPLORER } from "../src/coloring/stegosaurusExplorer.ts";

// Visible interiors include the small toes and plates, independently of the
// painter's hit testing and the larger connected head/body/near-leg region.
export const stegosaurusHatchlingProbes: readonly (readonly [number, number, string])[] = [
  [232, 492, "front-far"], [447, 488, "rear-far"],
  [441, 116, "plate-1"], [326, 135, "plate-2"], [239, 184, "plate-3"],
  [184, 245, "plate-4"], [248, 242, "plate-5"], [309, 194, "plate-6"],
  [395, 162, "plate-7"], [474, 176, "plate-8"], [551, 149, "plate-9"],
  [553, 216, "plate-10"], [616, 203, "plate-11"], [680, 237, "plate-12"],
  [627, 251, "plate-13"], [397, 391, "body"], [358, 227, "back"],
  [156, 276, "plate-14"], [195, 282, "plate-15"],
  [182, 562, "toe-1"], [198, 562, "toe-2"], [220, 562, "toe-3"],
  [286, 565, "toe-4"], [300, 567, "toe-5"], [322, 568, "toe-6"],
  [413, 561, "toe-7"], [431, 560, "toe-8"], [452, 561, "toe-9"],
  [535, 563, "toe-10"], [553, 564, "toe-11"], [578, 565, "toe-12"],
  [344, 493, "spot-1"], [287, 341, "spot-2"], [265, 424, "spot-3"],
  [312, 448, "spot-4"], [336, 368, "spot-5"], [190, 360, "spot-6"],
  [352, 299, "spot-7"], [566, 314, "spot-8"], [532, 398, "spot-9"],
  [546, 474, "spot-10"], [648, 307, "spot-11"], [721, 286, "spot-12"],
  [805, 168, "spike-1"], [829, 165, "spike-2"],
  [854, 148, "spike-3"], [848, 189, "spike-4"]
];
import type { AgeLevel } from "../src/ageLevel.ts";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { ColoringGame } from "../src/ColoringGame.tsx";
import { coloringWorkshopRoot, coloringVersionsFor } from "../src/coloringWorkshopRoot.ts";
import type { Language } from "../src/language/language.ts";
import { browserInput } from "../src/root.ts";
import { InputArbitrationContext } from "../src/inputArbitration.ts";
import "../src/app.css";

const input = browserInput(window);
let root: Root | undefined;
let resources: ReturnType<typeof coloringWorkshopRoot>;
let starts = 0, homes = 0;
let language: Language = "en";
let level: AgeLevel = "hatchling";
let denyReads = false, denyWrites = false;
let abortCompletion = false;
const put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
  const request = put.apply(this, args);
  if (abortCompletion && this.transaction.db.name === "rexlab-coloring" && args[0]?.document?.completed) this.transaction.abort();
  return request;
};
const transaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
  if (this.name === "rexlab-coloring" && (denyReads || (denyWrites && args[1] === "readwrite"))) throw new Error("Storage denied");
  return transaction.apply(this, args);
};
function show() {
  flushSync(() => root!.render(<InputArbitrationContext value={input.arbitrate}><ColoringGame source={resources} artworks={resources.artworks} offeredVersions={coloringVersionsFor(level)} painterFor={resources.painterFor} language={language}
    identity={() => Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join("-")} countStart={() => { starts++; }}
    home={() => { homes++; flushSync(() => root!.render(<button onClick={show}>ENTER COLORING</button>)); }} /></InputArbitrationContext>));
}
export async function mount(options: { language?: Language; level?: AgeLevel; theme?: "light" | "dark"; seed?: boolean } = {}) {
  root?.unmount(); await resources?.close();
  level = options.level ?? "hatchling";
  language = options.language ?? "en"; denyReads = false; denyWrites = false; abortCompletion = false;
  document.documentElement.dataset.theme = options.theme ?? "light";
  resources = coloringWorkshopRoot(indexedDB, document);
  if (options.seed && !(await resources.list()).works.length) {
    const red = await resources.newWork("red", () => {});
    red.append({ kind: "fill", color: "#ef5350", region: "body" }); await red.settled(); red.go("result"); await red.settled();
    const blue = await resources.newWork("blue", () => {});
    blue.append({ kind: "fill", color: "#42a5f5", region: "body" }); await blue.settled();
  }
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!); show();
}
export const counts = () => ({ starts, homes });
export const list = () => resources.list();
export const newWork = (id: string) => resources.newWork(id, () => {});
export const painter = () => resources.painter;
export const painterFor = (geometry: string) => resources.painterFor(geometry);
export const reset = () => resources.reset();
export const readFailure = (deny: boolean) => { denyReads = deny; };
export const writeFailure = (deny: boolean) => { denyWrites = deny; };
export const completionAbort = (abort: boolean) => { abortCompletion = abort; };
export function appearance(next: Language, theme: "light" | "dark") {
  language = next; document.documentElement.dataset.theme = theme; show();
}
export async function damage(id: string, part: "paint" | "history") {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("rexlab-coloring"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("works", "readwrite"), store = tx.objectStore("works"), request = store.get(id);
      request.onsuccess = () => {
        const row = request.result;
        if (part === "paint") row.document.actions = [null]; else row.history = { schema: 99 };
        store.put(row, id);
      };
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
