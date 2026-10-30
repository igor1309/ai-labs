import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { ColoringGame } from "../src/ColoringGame.tsx";
import { coloringWorkshopRoot } from "../src/coloringWorkshopRoot.ts";
import type { Language } from "../src/language/language.ts";
import { filterDoubleTaps } from "../src/root.ts";
import "../src/app.css";

filterDoubleTaps(window);
let root: Root | undefined;
let resources: ReturnType<typeof coloringWorkshopRoot>;
let starts = 0, identities = 0, homes = 0;
let language: Language = "en";
let denyReads = false, denyWrites = false;
const transaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
  if (this.name === "rexlab-coloring" && (denyReads || (denyWrites && args[1] === "readwrite"))) throw new Error("Storage denied");
  return transaction.apply(this, args);
};
function show() {
  flushSync(() => root!.render(<ColoringGame source={resources} painter={resources.painter} language={language}
    identity={() => `gallery-${++identities}`} countStart={() => { starts++; }}
    home={() => { homes++; flushSync(() => root!.render(<button onClick={show}>ENTER COLORING</button>)); }}
    result={() => { root!.unmount(); root = createRoot(document.getElementById("root")!); show(); }} />));
}
export async function mount(options: { language?: Language; theme?: "light" | "dark"; seed?: boolean } = {}) {
  root?.unmount(); await resources?.close();
  language = options.language ?? "en"; denyReads = false; denyWrites = false;
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
export const readFailure = (deny: boolean) => { denyReads = deny; };
export const writeFailure = (deny: boolean) => { denyWrites = deny; };
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
