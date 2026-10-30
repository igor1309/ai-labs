import { describe, expect, it } from "vitest";
import { BASE_COLOR, BRUSH_SIZES, COLORS, coloringModel, type Action } from "../src/coloring/index.ts";
import { coloringFixture } from "./coloringFixture.ts";

describe("production editable coloring work", () => {
  it("round trips all colors, brush sizes and region fills with independent undo histories", () => {
    const { model, dot } = coloringFixture();
    let work = model.newWork("first");
    for (const color of COLORS) for (const size of BRUSH_SIZES) {
      work = model.append(work, { kind: "fill", region: "body", color: color === COLORS[1] ? COLORS[2] : COLORS[1] });
      work = model.append(work, { ...dot, color, size });
    }
    expect(work.actions.filter(action => action.kind === "stroke")).toHaveLength(COLORS.length * BRUSH_SIZES.length);
    for (const region of ["body", "head"]) work = model.append(work, { kind: "fill", color: COLORS[1], region });
    const restored = model.readWork(JSON.parse(JSON.stringify(work)));
    expect(restored).toEqual(work);
    const continued = model.append(model.undo(restored), { ...dot, color: COLORS[2] });
    expect(continued.id).toBe("first");
    expect(continued.revision).toBe(work.revision + 2);
    expect(continued.actions.at(-1)).toEqual({ ...dot, color: COLORS[2] });
    expect(continued.actions.slice(0, -1)).toEqual(work.actions.slice(0, -1));
    const second = model.append(model.newWork("second"), dot);
    expect(second.id).toBe("second"); expect(second.actions).toEqual([dot]);
    expect(restored).toEqual(work);
    expect(model.undo(model.newWork("empty"))).toEqual(model.newWork("empty"));
  });

  it("accepts one action per visible change and ignores base-only, outside, protected and repeated contacts", () => {
    const { model, dot } = coloringFixture();
    const empty = model.newWork("one");
    for (const action of [
      { ...dot, color: BASE_COLOR }, { ...dot, points: [{ x: -10, y: 0 }] },
      { ...dot, points: [{ x: 0, y: 1 }] }, { kind: "fill", color: BASE_COLOR, region: "body" }
    ] as Action[]) expect(model.append(empty, action)).toEqual(empty);
    const painted = model.append(empty, dot);
    expect(painted.actions).toEqual([dot]); expect(painted.revision).toBe(1);
    expect(model.isEmpty(painted)).toBe(false);
    expect(model.append(painted, dot)).toEqual(painted);
    const filled = model.append(painted, { kind: "fill", region: "body", color: COLORS[2] });
    expect(filled.actions).toHaveLength(2);
    expect(model.append(filled, { kind: "fill", region: "body", color: COLORS[2] })).toEqual(filled);
    const undone = model.undo(filled);
    expect(undone.actions).toEqual([dot]); expect(undone.revision).toBe(3);
    expect(model.isEmpty(model.undo(undone))).toBe(true);
  });

  it.each([false, true])("retains identity, history and earned status when base paint returns a completed=%s work to empty", completed => {
    const { model, dot } = coloringFixture();
    let work = model.append(model.newWork("one"), dot);
    if (completed) work = model.complete(work);
    const empty = model.append(work, { kind: "fill", region: "body", color: BASE_COLOR });
    expect(model.isEmpty(empty)).toBe(true);
    expect(empty.id).toBe(work.id); expect(empty.actions).toHaveLength(2);
    expect(empty.completed).toBe(completed); expect(empty.rewarded).toBe(completed);
    expect(() => model.complete(empty)).toThrow("Empty");
    const undone = model.undo(empty);
    expect(undone.actions).toEqual(work.actions); expect(model.isEmpty(undone)).toBe(false);
    expect(undone.rewarded).toBe(completed);
  });

  it("completes once without clearing history, including after restore and further edits", () => {
    const { model, dot } = coloringFixture();
    expect(() => model.complete(model.newWork("one"))).toThrow("Empty");
    const draft = model.append(model.newWork("one"), dot);
    const completed = model.complete(draft);
    expect(completed).toEqual({ ...draft, revision: 2, completed: true, rewarded: true });
    expect(model.complete(completed)).toEqual(completed);
    const edited = model.append(model.readWork(JSON.parse(JSON.stringify(completed))), { ...dot, color: COLORS[2] });
    expect(edited.actions).toHaveLength(2); expect(edited.completed).toBe(true); expect(edited.rewarded).toBe(true);
    expect(model.complete(edited)).toEqual(edited);
    expect(draft.completed).toBe(false); expect(draft.rewarded).toBe(false);
  });

  it("owns immutable snapshots of deserialized and accepted actions", () => {
    const { model } = coloringFixture();
    const action = { kind: "stroke" as const, color: COLORS[1], size: 20 as const, points: [{ x: 0, y: 0 }] };
    const work = model.append(model.newWork("one"), action);
    action.points[0]!.x = 10;
    expect(work.actions[0]).toEqual({ ...action, points: [{ x: 0, y: 0 }] });
    const raw = JSON.parse(JSON.stringify(work));
    const restored = model.readWork(raw); raw.actions[0].points[0].x = 20;
    expect(restored).toEqual(work);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored.actions)).toBe(true);
    expect(Object.isFrozen((restored.actions[0] as Extract<Action, { kind: "stroke" }>).points[0])).toBe(true);
  });

  it("requires both artwork and visible-paint inspection at construction", () => {
    expect(() => coloringModel({ version: "art-1", regions: ["body"] }, undefined!)).toThrow("requires");
    for (const artwork of [
      { version: "", regions: ["body"] }, { version: "art-1", regions: [] },
      { version: "art-1", regions: ["body", "body"] }, { version: "art-1", regions: new Array(1) }
    ]) expect(() => coloringModel(artwork, { same: () => true })).toThrow("requires");
  });

  it("rejects corrupt and unsupported records without mutating their input", () => {
    const { model, dot } = coloringFixture();
    const empty = model.newWork("one");
    const badActions = [
      null, { ...dot, kind: "future" }, { ...dot, color: "transparent" }, { ...dot, size: 9 },
      { ...dot, points: [] }, { ...dot, points: new Array(1) },
      ...[Infinity, NaN, 100001, "1"].map(x => ({ ...dot, points: [{ x, y: 0 }] })),
      { ...dot, points: [null] }, { kind: "fill", color: COLORS[1], region: "unknown" }
    ];
    const badWorks = [
      null, {}, { ...empty, schema: 2 }, { ...empty, geometry: "future" }, { ...empty, id: "../bad" },
      ...[-1, 0.1, Infinity, Number.MAX_SAFE_INTEGER + 1].map(revision => ({ ...empty, revision })),
      { ...empty, actions: [dot] }, { ...empty, revision: 1, actions: new Array(1) },
      { ...empty, completed: true }, { ...empty, rewarded: true }, { ...empty, completed: "false" },
      { ...empty, completed: true, rewarded: true },
      ...badActions.map(action => ({ ...empty, revision: 1, actions: [action] }))
    ];
    for (const value of badWorks) {
      const before = structuredClone(value);
      expect(() => model.readWork(value)).toThrow(); expect(value).toEqual(before);
    }
    const overflow = { ...empty, revision: Number.MAX_SAFE_INTEGER };
    expect(() => model.append(overflow, dot)).toThrow();
    expect(() => model.complete({ ...overflow, actions: [dot] })).toThrow();
  });
});
