import type { Work } from "./coloring/index.ts";
import type { ColoringWorkshopSession, WorkshopNavigation } from "./coloringWorkshop.ts";

export type GalleryWork = Readonly<{ document: Work; thumbnail: Blob }>;
export type GalleryCollection = Readonly<{
  works: readonly GalleryWork[];
  unavailable: readonly unknown[];
  completedCount: number | null;
  recentId: string | null;
}>;
export type GallerySource = {
  list(): Promise<GalleryCollection>;
  reset(): Promise<void>;
  open(id: string, navigate: (navigation: WorkshopNavigation) => void): Promise<ColoringWorkshopSession>;
  newWork(id: string, navigate: (navigation: WorkshopNavigation) => void, geometry?: string): Promise<ColoringWorkshopSession>;
};
type Dependencies = {
  source: GallerySource;
  identity(): string;
  countStart(): void;
  workshop(session: ColoringWorkshopSession): void;
  navigate(navigation: WorkshopNavigation): void;
};
export type GalleryState = Readonly<{
  collection: GalleryCollection | null;
  busy: boolean;
  warning: boolean;
  recovery: boolean;
  recoveryError: boolean;
  viewing: GalleryWork | null;
}>;

export function coloringGallery({ source, identity, countStart, workshop, navigate }: Dependencies) {
  let state: GalleryState = { collection: null, busy: true, warning: false, recovery: false, recoveryError: false, viewing: null };
  let visit = 0;
  let departed = false;
  const listeners = new Set<() => void>();
  const update = (changes: Partial<GalleryState>) => {
    state = { ...state, ...changes };
    listeners.forEach(listener => listener());
  };
  async function load(create: boolean | string = false) {
    const current = ++visit;
    update({ busy: true });
    try {
      const collection = await source.list();
      if (current !== visit) return;
      update({ collection, busy: false, warning: collection.completedCount === null || collection.unavailable.length > 0 });
      if (create) await enter(undefined, typeof create === "string" ? create : undefined);
    } catch {
      if (current === visit) update({ busy: false, warning: true });
    }
  }
  async function enter(id?: string, geometry?: string) {
    if (departed || state.busy || state.recovery || state.viewing || state.collection?.completedCount == null) return;
    if (id !== undefined && !state.collection.works.some(record => record.document.id === id)) return;
    const current = visit;
    update({ busy: true });
    try {
      const session = id === undefined ? (geometry === undefined ? await source.newWork(identity(), navigate) : await source.newWork(identity(), navigate, geometry)) : await source.open(id, navigate);
      if (current !== visit) return;
      if (id === undefined) countStart();
      departed = true;
      workshop(session);
    } catch {
      if (current === visit) update({ busy: false, warning: true });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    enter,
    view(record: GalleryWork) { if (!state.busy && !state.recovery) update({ viewing: record }); },
    closeView() { update({ viewing: null }); },
    recover() { if (!state.busy && state.collection?.completedCount == null) update({ recovery: true, recoveryError: false }); },
    cancelRecovery() { if (!state.busy) update({ recovery: false, recoveryError: false }); },
    async reset() {
      if (state.busy || !state.recovery) return;
      const current = visit;
      update({ busy: true, recoveryError: false });
      try {
        await source.reset();
        if (current !== visit) return;
        update({ recovery: false, collection: { works: [], unavailable: [], completedCount: 0, recentId: null }, busy: false, warning: false });
      } catch {
        if (current === visit) update({ busy: false, recoveryError: true });
      }
    },
    stop() { visit++; }
  };
}
export type ColoringGallerySession = ReturnType<typeof coloringGallery>;
