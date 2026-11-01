import type { Action, Work } from "./coloring/index.ts";

export type WorkshopDestination = "home" | "gallery" | "new" | "result";
export type Completion = Readonly<{ completedCount: number; earned: boolean }>;
export type WorkshopNavigation = { destination: "result"; work: Work; completion: Completion } |
  { destination: Exclude<WorkshopDestination, "result">; work: Work };
type Model = {
  readWork(value: unknown): Work;
  append(work: Work, action: Action): Work;
  undo(work: Work): Work;
  complete(work: Work): Work;
  isEmpty(work: Work): boolean;
};
type Dependencies = {
  model: Model;
  write(record: { document: Work; thumbnail: Blob }, expected: number | null): Promise<void>;
  complete(record: { document: Work; thumbnail: Blob }, expected: number | null): Promise<Completion>;
  thumbnail(work: Work): Promise<Blob>;
  navigate(navigation: WorkshopNavigation): void;
};
export type WorkshopState = Readonly<{
  work: Work;
  save: "untouched" | "saving" | "saved" | "error";
  saveError: boolean;
  frozen: boolean;
  errorOpen: boolean;
  confirmingLoss: boolean;
}>;

// The queue owns durable order; the screen always draws the latest accepted
// work. A failed head stays queued so retry cannot skip an accepted revision.
export function coloringWorkshop(initial: Work, durable: number | null, dependencies: Dependencies) {
  const { model, write, complete, thumbnail, navigate } = dependencies;
  if (!model || !write || !complete || !thumbnail || !navigate) throw new Error("Workshop collaborators are required");
  let state: WorkshopState = { work: model.readWork(initial), save: durable === null ? "untouched" : "saved",
    saveError: false, frozen: false, errorOpen: false, confirmingLoss: false };
  if ((durable === null && initial.revision !== 0) || (durable !== null && durable !== initial.revision)) {
    throw new Error("Workshop must open an untouched or durable revision");
  }
  let durableWork = state.work;
  let queue: Work[] = [];
  let running: Promise<void> | undefined;
  let pending: WorkshopDestination | undefined;
  let departed = false;
  const listeners = new Set<() => void>();
  const update = (changes: Partial<WorkshopState>) => {
    state = { ...state, ...changes };
    listeners.forEach(listener => listener());
  };
  const leave = (navigation: WorkshopNavigation) => {
    if (departed) return;
    departed = true;
    update({ frozen: true });
    navigate(navigation);
  };
  const pump = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (queue.length) {
        const work = queue[0]!;
        try {
          const image = await thumbnail(work);
          await write({ document: work, thumbnail: image }, durable);
          durable = work.revision;
          durableWork = work;
          queue.shift();
        } catch {
          update({ save: "error", saveError: true, frozen: false, errorOpen: true });
          return;
        }
      }
      if (pending === "result") {
        try {
          const completion = model.complete(state.work);
          const image = await thumbnail(completion);
          const receipt = await complete({ document: completion, thumbnail: image }, durable);
          durable = completion.revision;
          durableWork = completion;
          update({ work: completion, save: "saved", saveError: false });
          leave({ destination: "result", work: completion, completion: receipt });
          return;
        } catch {
          update({ save: "error", saveError: true, frozen: false, errorOpen: true });
          return;
        }
      }
      update({ save: "saved", saveError: false });
      if (pending) leave({ destination: pending, work: state.work });
    })().finally(() => { running = undefined; });
    return running;
  };
  const accept = (work: Work) => {
    if (work.revision === state.work.revision) return;
    queue.push(work);
    const failed = state.save === "error";
    update({ work, save: failed ? "error" : "saving" });
    if (!failed) void pump();
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    append(action: Action) {
      if (!state.frozen && !state.errorOpen && !state.confirmingLoss) { pending = undefined; accept(model.append(state.work, action)); }
    },
    undo() {
      if (!state.frozen && !state.errorOpen && !state.confirmingLoss) { pending = undefined; accept(model.undo(state.work)); }
    },
    isEmpty: () => model.isEmpty(state.work),
    go(destination: WorkshopDestination) {
      if (departed || state.frozen || state.confirmingLoss || (destination === "result" && model.isEmpty(state.work))) return;
      pending = destination;
      update({ frozen: true, save: destination === "result" && state.save !== "error" ? "saving" : state.save });
      if (state.save === "error") { update({ frozen: false, errorOpen: true }); return; }
      if (!queue.length && destination !== "result") leave({ destination, work: state.work });
      else void pump();
    },
    retry() {
      if (state.save !== "error" || running) return running ?? Promise.resolve();
      update({ save: "saving", frozen: pending !== undefined, errorOpen: false });
      return pump();
    },
    keepEditing() { pending = undefined; update({ errorOpen: false, frozen: false }); },
    askLoss() { if (state.save === "error") update({ confirmingLoss: true }); },
    cancelLoss() { update({ confirmingLoss: false }); },
    confirmLoss() { if (state.confirmingLoss && !running) leave({ destination: "home", work: durableWork }); },
    settled: () => running ?? Promise.resolve()
  };
}
export type ColoringWorkshopSession = ReturnType<typeof coloringWorkshop>;
