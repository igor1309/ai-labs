// What a child has dug up, across every level (docs/age-levels.md, "Same
// rewards"): the ids of the dinosaurs dug up, and of those named at the
// first pick at Explorer or Paleontologist, each its 🦴 badge. An id the app no
// longer ships is kept but never counted.
export type DigProgress = { dug: readonly string[]; badges: readonly string[] };

export const NO_DIG: DigProgress = { dug: [], badges: [] };

// The progress the game goes by while the app is open. When stored
// progress cannot be read there is no count to show or celebrate, but
// the dinosaurs dug up meanwhile are still kept, so a round still digs
// up one not dug up yet.
export type KeptDig = { progress: DigProgress; readable: boolean };

export type Celebration = "first-best" | "new-best";

// The best-score rule the game is scored by: the dinosaurs dug up are its
// score, null before the first.
export type BeatBest = (previous: number | null, score: number) => { best: number; celebration: Celebration | null };

// What a dinosaur dug up earns, shown on its reveal.
export type DigReward = {
  // The dinosaurs dug up, this one among them, out of every one shipped;
  // undefined when stored progress cannot be read.
  dugUp: number | undefined;
  total: number;
  // The dinosaur was dug up for the first time, so its star flies in.
  newStar: boolean;
  celebration: Celebration | null;
  // The dinosaur has its 🦴 badge.
  badge: boolean;
};

// Each of `ids`, in their order, that `held` holds.
const shipped = (held: readonly string[], ids: readonly string[]) => ids.filter((id) => held.includes(id));

// The dinosaurs dug up that the app still ships.
export const dugUpOf = (progress: DigProgress, ids: readonly string[]): number => shipped(progress.dug, ids).length;

// Every dinosaur and badge of either: a visit may hold one unsaved while
// another tab saves others meanwhile.
export function mergeProgress(kept: DigProgress, stored: DigProgress): DigProgress {
  const both = (one: readonly string[], other: readonly string[]) => [...new Set([...one, ...other])];
  return { dug: both(kept.dug, stored.dug), badges: both(kept.badges, stored.badges) };
}

// The progress with `dinosaurId` dug up, and its reward. Only a dinosaur
// dug up for the first time earns a star, and the count it grows is
// celebrated by the best-score rule; `ids` are the dinosaurs shipped.
// Naming at the first pick adds a badge, even on a repeat dig; later
// reveals keep it regardless of the level or any wrong picks.
export function digUp(kept: KeptDig, dinosaurId: string, ids: readonly string[], beatBest: BeatBest, namedFirst = false): { kept: KeptDig; reward: DigReward } {
  const newStar = !kept.progress.dug.includes(dinosaurId);
  const progress = {
    dug: newStar ? [...kept.progress.dug, dinosaurId] : kept.progress.dug,
    badges: namedFirst && !kept.progress.badges.includes(dinosaurId) ? [...kept.progress.badges, dinosaurId] : kept.progress.badges
  };
  const before = dugUpOf(kept.progress, ids);
  const after = dugUpOf(progress, ids);
  const { celebration } = beatBest(before === 0 ? null : before, after);
  return {
    kept: { ...kept, progress },
    reward: {
      dugUp: kept.readable ? after : undefined,
      total: ids.length,
      newStar,
      celebration: kept.readable ? celebration : null,
      badge: progress.badges.includes(dinosaurId)
    }
  };
}
