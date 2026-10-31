import type { GalleryArtwork } from "./ColoringGalleryScreen.tsx";
import { coloringModel, type Work } from "./coloring/index.ts";
import { ARTWORK } from "./coloring/geometry.ts";
import { ARTWORKS, artworkFor } from "./coloring/artworks.ts";
import { createPainter } from "./coloring/painter.ts";
import { indexedColoringWorks } from "./indexedColoringWorks.ts";
import { coloringWorkshop, type WorkshopNavigation } from "./coloringWorkshop.ts";

// One set of artwork paths/inspection surfaces serves the model, previews and
// thumbnails. Callers supply identity and navigation.
export function coloringWorkshopRoot(factory: Pick<IDBFactory, "open">, document: Pick<Document, "createElement">) {
  const resources = new Map<string, { painter: ReturnType<typeof createPainter>; model: ReturnType<typeof coloringModel> }>();
  function forGeometry(version: string) {
    let entry = resources.get(version);
    if (!entry) {
      const geometry = artworkFor(version).geometry;
      const painter = createPainter(() => document.createElement("canvas"), geometry);
      entry = { painter, model: coloringModel(geometry.artwork, painter.inspection) };
      resources.set(version, entry);
    }
    return entry;
  }
  const store = indexedColoringWorks(factory, "rexlab-coloring", {
    readWork(value: unknown) {
      if (!value || typeof value !== "object" || !("geometry" in value) || typeof value.geometry !== "string") throw new Error("Missing coloring artwork");
      return forGeometry(value.geometry).model.readWork(value);
    },
    isEmpty: work => forGeometry(work.geometry).model.isEmpty(work)
  });
  async function thumbnail(work: Work): Promise<Blob> {
    const { painter } = forGeometry(work.geometry);
    const canvas = painter.canvas(276, 186);
    painter.render(canvas, work.actions);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Coloring thumbnail unavailable")), "image/png"));
  }
  const session = (work: Work, durable: number | null, navigate: (navigation: WorkshopNavigation) => void) =>
    coloringWorkshop(work, durable, { model: forGeometry(work.geometry).model, write: store.write, complete: store.complete, thumbnail, navigate });
  return {
    artworks: ARTWORKS.map(({ geometry, names }): GalleryArtwork => ({
      version: geometry.artwork.version,
      names,
      preview: { width: 276, height: 186, render: target => forGeometry(geometry.artwork.version).painter.render(target, []) }
    })),
    get painter() { return forGeometry(ARTWORK.version).painter; },
    painterFor: (version: string) => forGeometry(version).painter,
    list: store.list,
    reset: store.reset,
    async open(id: string, navigate: (navigation: WorkshopNavigation) => void) {
      const collection = await store.list();
      if (collection.completedCount === null) throw new Error("Coloring history is unreadable");
      const record = collection.works.find(record => record.document.id === id);
      if (!record) throw new Error("Coloring work unavailable");
      return session(record.document, record.document.revision, navigate);
    },
    async newWork(id: string, navigate: (navigation: WorkshopNavigation) => void, geometry = ARTWORK.version) {
      const collection = await store.list();
      if (collection.completedCount === null) throw new Error("Coloring history is unreadable");
      if (collection.works.some(record => record.document.id === id) || collection.unavailable.includes(id)) throw new Error("Coloring identity already exists");
      return session(forGeometry(geometry).model.newWork(id), null, navigate);
    },
    close: store.close
  };
}
