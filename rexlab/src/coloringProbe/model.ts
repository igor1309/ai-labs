import { COLORS, GEOMETRY, REGIONS, SIZES, type Point, type Region } from "./geometry.ts";
export type Action = { kind: "stroke"; color: string; size: number; points: Point[] } | { kind: "fill"; color: string; region: Region };
export type Work = { schema: 1; geometry: typeof GEOMETRY; id: string; revision: number; actions: Action[] };
export type RecordData = { document: Work; thumbnail: Blob };
export const validId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,100}$/.test(id);
export function newWork(id: string): Work {
  if (!validId(id)) throw new Error("Invalid work identity");
  return { schema: 1, geometry: GEOMETRY, id, revision: 0, actions: [] };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const coordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100000;
function validPoints(value: unknown): boolean {
  if (!Array.isArray(value) || !value.length) return false;
  for (let index = 0; index < value.length; index++) {
    const point: unknown = value[index];
    if (!Object.hasOwn(value, index) || !object(point) || !coordinate(point.x) || !coordinate(point.y)) return false;
  }
  return true;
}
export function readWork(value: unknown): Work {
  if (!object(value) || value.schema !== 1 || value.geometry !== GEOMETRY || !validId(value.id) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.actions) || (value.revision as number) < value.actions.length) throw new Error("Unsupported or damaged work");
  for (const action of value.actions) {
    if (!object(action) || !COLORS.some(color => color === action.color)) throw new Error("Invalid paint");
    if (action.kind === "fill") {
      if (!REGIONS.some(region => region.id === action.region)) throw new Error("Unknown region");
    } else if (action.kind === "stroke") {
      if (!SIZES.some(size => size === action.size) || !validPoints(action.points)) throw new Error("Invalid stroke");
    } else throw new Error("Unknown action");
  }
  // A validated copy cannot be mutated through the deserializer's input.
  return structuredClone(value) as Work;
}
export function readRecord(value: unknown, id: string): RecordData {
  if (!object(value) || !(value.thumbnail instanceof Blob) || value.thumbnail.type !== "image/png" || !value.thumbnail.size) throw new Error("Damaged thumbnail");
  const document = readWork(value.document);
  if (document.id !== id) throw new Error("Work identity mismatch");
  return { document, thumbnail: value.thumbnail };
}
export function append(work: Work, action: Action): Work {
  return readWork({ ...work, revision: work.revision + 1, actions: [...work.actions, action] });
}
export function undo(work: Work): Work {
  return work.actions.length ? { ...work, revision: work.revision + 1, actions: work.actions.slice(0, -1) } : work;
}
