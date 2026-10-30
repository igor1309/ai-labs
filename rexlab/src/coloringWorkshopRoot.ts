import { coloringModel, type Work } from "./coloring/index.ts";
import { ARTWORK } from "./coloring/geometry.ts";
import { createPainter } from "./coloring/painter.ts";
import { indexedColoringWorks } from "./indexedColoringWorks.ts";
import { coloringWorkshop, type WorkshopNavigation } from "./coloringWorkshop.ts";

// One set of artwork paths/inspection surfaces serves the model, previews and
// thumbnails. Callers supply identity and navigation, including future screens.
export function coloringWorkshopRoot(factory: Pick<IDBFactory, "open">, document: Pick<Document, "createElement">) {
  const painter = createPainter(() => document.createElement("canvas"));
  const model = coloringModel(ARTWORK, painter.inspection);
  const store = indexedColoringWorks(factory, "rexlab-coloring", model);
  async function thumbnail(work: Work): Promise<Blob> {
    const canvas = painter.canvas(276, 186);
    painter.render(canvas, work.actions);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Coloring thumbnail unavailable")), "image/png"));
  }
  const session = (work: Work, durable: number | null, navigate: (navigation: WorkshopNavigation) => void) =>
    coloringWorkshop(work, durable, { model, write: store.write, thumbnail, navigate });
  return {
    painter,
    list: store.list,
    reset: store.reset,
    async open(id: string, navigate: (navigation: WorkshopNavigation) => void) {
      const collection = await store.list();
      if (collection.completedCount === null) throw new Error("Coloring history is unreadable");
      const record = collection.works.find(record => record.document.id === id);
      if (!record) throw new Error("Coloring work unavailable");
      return session(record.document, record.document.revision, navigate);
    },
    async newWork(id: string, navigate: (navigation: WorkshopNavigation) => void) {
      const collection = await store.list();
      if (collection.completedCount === null) throw new Error("Coloring history is unreadable");
      if (collection.works.some(record => record.document.id === id) || collection.unavailable.includes(id)) throw new Error("Coloring identity already exists");
      return session(model.newWork(id), null, navigate);
    },
    close: store.close
  };
}
