import type { ColoringWorkshopSession, WorkshopNavigation } from "./coloringWorkshop.ts";

export type ResultAction = "edit" | "gallery" | "new" | "home";
type Dependencies = {
  open(id: string, navigate: (navigation: WorkshopNavigation) => void): Promise<ColoringWorkshopSession>;
  navigate(navigation: WorkshopNavigation): void;
  workshop(session: ColoringWorkshopSession): void;
  leave(destination: Exclude<ResultAction, "edit">): void;
};

// One result visit owns opening the durable work and departure. A failed read
// leaves its accepted picture visible and lets the child retry EDIT.
export function coloringResult(id: string, dependencies: Dependencies) {
  let state = { busy: false, error: false };
  let active = true;
  let visit = 0;
  const listeners = new Set<() => void>();
  const update = (changes: Partial<typeof state>) => {
    state = { ...state, ...changes };
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async choose(action: ResultAction) {
      if (!active || state.busy) return;
      const current = visit;
      update({ busy: true, error: false });
      if (action !== "edit") { active = false; dependencies.leave(action); return; }
      try {
        const session = await dependencies.open(id, dependencies.navigate);
        if (!active || current !== visit) return;
        active = false;
        dependencies.workshop(session);
      } catch {
        if (active && current === visit) update({ busy: false, error: true });
      }
    },
    start() { active = true; },
    stop() { active = false; visit++; }
  };
}
