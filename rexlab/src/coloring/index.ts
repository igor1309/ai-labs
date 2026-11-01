export const BASE_COLOR = "#fff0cf";
export const COLORS = [BASE_COLOR, "#ef5350", "#ff9345", "#ffd84a", "#9ccc65", "#26a69a", "#42a5f5", "#536dce", "#ab67cb", "#f78fbd", "#875c45", "#3c4358"] as const;
export const BRUSH_SIZES = [8, 20, 40] as const;
export type Color = typeof COLORS[number];
export type BrushSize = typeof BRUSH_SIZES[number];
export type Point = Readonly<{ x: number; y: number }>;
export type Action = Readonly<
  { kind: "stroke"; color: Color; size: BrushSize; points: readonly Point[] } |
  { kind: "fill"; color: Color; region: string }
>;
export type Work = Readonly<{
  schema: 1;
  geometry: string;
  id: string;
  revision: number;
  actions: readonly Action[];
  completed: boolean;
  rewarded: boolean;
}>;

// The illustration owns clipping, protected details and visible-pixel tolerance.
// Equality compares the final composition, never action counts or chosen colors.
export type PaintInspection = {
  same(before: readonly Action[], after: readonly Action[]): boolean;
};
export type Artwork = { version: string; regions: readonly string[] };

// Saved points use this fixed coordinate space, independent of screen size or DPR.
export const WIDTH = 920;
export const HEIGHT = 620;

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,100}$/.test(value);
const coordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100000;
const natural = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function coloringModel(artwork: Artwork, paint: PaintInspection) {
  if (!artwork || !validId(artwork.version) || !Array.isArray(artwork.regions) || !artwork.regions.length ||
      !Array.from(artwork.regions).every(validId) || new Set(artwork.regions).size !== artwork.regions.length || typeof paint?.same !== "function") {
    throw new Error("Coloring requires versioned artwork and paint inspection");
  }
  const geometry = artwork.version;
  const regions = new Set(artwork.regions);
  function readAction(value: unknown): Action {
    if (!object(value) || !COLORS.some(color => color === value.color)) throw new Error("Invalid paint color");
    const color = value.color as Color;
    if (value.kind === "fill" && typeof value.region === "string" && regions.has(value.region)) {
      return Object.freeze({ kind: "fill", color, region: value.region });
    }
    if (value.kind !== "stroke" || !BRUSH_SIZES.some(size => size === value.size) || !Array.isArray(value.points) || !value.points.length) {
      throw new Error("Invalid paint action");
    }
    const points: Point[] = [];
    for (let i = 0; i < value.points.length; i++) {
      const point: unknown = value.points[i];
      if (!Object.hasOwn(value.points, i) || !object(point) || !coordinate(point.x) || !coordinate(point.y)) throw new Error("Invalid stroke point");
      points.push(Object.freeze({ x: point.x, y: point.y }));
    }
    return Object.freeze({ kind: "stroke", color, size: value.size as BrushSize, points: Object.freeze(points) });
  }
  function readWork(value: unknown): Work {
    if (!object(value) || value.schema !== 1 || value.geometry !== geometry || !validId(value.id) || !natural(value.revision) ||
        !Array.isArray(value.actions) || value.revision < value.actions.length || typeof value.completed !== "boolean" ||
        typeof value.rewarded !== "boolean" || value.completed !== value.rewarded || (value.completed && value.revision <= value.actions.length)) {
      throw new Error("Unsupported or damaged coloring work");
    }
    const actions: Action[] = [];
    for (let i = 0; i < value.actions.length; i++) {
      if (!Object.hasOwn(value.actions, i)) throw new Error("Missing paint action");
      actions.push(readAction(value.actions[i]));
    }
    return Object.freeze({ schema: 1, geometry, id: value.id, revision: value.revision,
      actions: Object.freeze(actions), completed: value.completed, rewarded: value.rewarded });
  }
  function next(work: Work, changes: Partial<Work>): Work {
    return readWork({ ...work, ...changes, revision: work.revision + 1 });
  }
  const isEmpty = (work: Work): boolean => paint.same([], work.actions);
  return {
    readWork,
    newWork(id: string): Work {
      return readWork({ schema: 1, geometry, id, revision: 0, actions: [], completed: false, rewarded: false });
    },
    isEmpty,
    append(work: Work, action: Action): Work {
      const safe = readWork(work), accepted = readAction(action);
      const actions = Object.freeze([...safe.actions, accepted]);
      return paint.same(safe.actions, actions) ? safe : next(safe, { actions });
    },
    undo(work: Work): Work {
      const safe = readWork(work);
      return safe.actions.length ? next(safe, { actions: safe.actions.slice(0, -1) }) : safe;
    },
    // Completion prepares a revision; only the repository's resolved write is durable.
    complete(work: Work): Work {
      const safe = readWork(work);
      if (isEmpty(safe)) throw new Error("Empty coloring work cannot complete");
      return safe.completed ? safe : next(safe, { completed: true, rewarded: true });
    }
  };
}
