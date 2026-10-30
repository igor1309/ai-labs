import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ColoringWorkshopScreen } from "../src/ColoringWorkshopScreen.tsx";
import { coloringWorkshopRoot } from "../src/coloringWorkshopRoot.ts";
import { coloringWorkshop, type ColoringWorkshopSession, type WorkshopNavigation } from "../src/coloringWorkshop.ts";
import { coloringModel, type Work } from "../src/coloring/index.ts";
import { ARTWORK } from "../src/coloring/geometry.ts";
import { createPainter } from "../src/coloring/painter.ts";
import { indexedColoringWorks } from "../src/indexedColoringWorks.ts";
import { browserInput } from "../src/root.ts";
import type { Language } from "../src/language/language.ts";
import { InputArbitrationContext } from "../src/inputArbitration.ts";
import "../src/app.css";

const input = browserInput(window);
let reactRoot: Root | undefined;
let resources: ReturnType<typeof coloringWorkshopRoot> | undefined;
let session: ColoringWorkshopSession;
let navigations: WorkshopNavigation[] = [];
let held: { resolve(): void; reject(error: Error): void } | undefined;
let writes = 0;
let gated = false;
let closeGate: (() => Promise<void>) | undefined;

export async function mount(options: { id: string; resume?: boolean; language?: Language; theme?: "dark" | "light"; gate?: boolean }) {
  reactRoot?.unmount();
  await closeGate?.();
  closeGate = undefined;
  await resources?.close();
  navigations = []; writes = 0; gated = options.gate ?? false;
  document.documentElement.dataset.theme = options.theme ?? "light";
  resources = coloringWorkshopRoot(indexedDB, document);
  const navigate = (navigation: WorkshopNavigation) => { navigations.push(navigation); };
  session = options.resume ? await resources.open(options.id, navigate) : await resources.newWork(options.id, navigate);
  let painter = resources.painter;
  if (options.gate) {
    painter = createPainter(() => document.createElement("canvas"));
    const model = coloringModel(ARTWORK, painter.inspection);
    const store = indexedColoringWorks(indexedDB, "rexlab-coloring", model);
    closeGate = store.close;
    const work = session.getSnapshot().work;
    session = coloringWorkshop(work, options.resume ? work.revision : null, {
      model, navigate,
      async thumbnail(work: Work) {
        const target = painter.canvas(276, 186); painter.render(target, work.actions);
        return new Promise<Blob>((resolve, reject) => target.toBlob(blob => blob ? resolve(blob) : reject(new Error("thumbnail"))));
      },
      async complete(record, expected) {
        writes++;
        if (gated) await new Promise<void>((resolve, reject) => { held = { resolve, reject }; });
        return store.complete(record, expected);
      },
      async write(record, expected) {
        writes++;
        if (gated) await new Promise<void>((resolve, reject) => { held = { resolve, reject }; });
        await store.write(record, expected);
      }
    });
  }
  document.body.innerHTML = '<div id="root"></div>';
  reactRoot = createRoot(document.getElementById("root")!);
  flushSync(() => reactRoot!.render(<InputArbitrationContext value={input.arbitrate}><ColoringWorkshopScreen session={session} painter={painter} language={options.language ?? "en"} /></InputArbitrationContext>));
}
export const snapshot = () => session.getSnapshot();
export const departures = () => navigations;
export const settled = () => session.settled();
export const writeCount = () => writes;
export const release = () => { gated = false; held?.resolve(); held = undefined; };
export const fail = () => { held?.reject(new Error("quota")); held = undefined; };
