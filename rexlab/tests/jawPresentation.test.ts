import { describe, expect, it } from "vitest";
import { jawMouth } from "../src/jawPresentation.ts";
import jaws from "../src/data/jaws.json";

describe("gummy mouth presentation", () => {
  it("covers the entire shipped collection and keeps overlays inside each head region", () => {
    for (const { id, pair } of jaws) {
      const mouth = jawMouth(id);
      const rightFacing = id === "rhamphorhynchus";
      expect(mouth.mirror, id).toBe(rightFacing);
      expect(mouth.x, id).toBeGreaterThan(rightFacing ? 70 : 0);
      expect(mouth.x, id).toBeLessThan(rightFacing ? 90 : 25);
      expect(mouth.x - mouth.width / 2, id).toBeGreaterThanOrEqual(0);
      expect(mouth.x + mouth.width / 2, id).toBeLessThanOrEqual(100);
      expect(mouth.width, id).toBeGreaterThan(0);
      expect(mouth.width, id).toBeLessThanOrEqual(25);
      if (pair === "long-necks") {
        expect(mouth.x, id).toBeLessThan(10);
        expect(mouth.y, id).toBeLessThan(30);
        expect(mouth.width, id).toBeLessThan(10);
      }
      if (["triceratops", "stegosaurus", "ankylosaurus"].includes(id)) {
        expect(mouth.y, id).toBeGreaterThanOrEqual(50);
        expect(mouth.y, id).toBeLessThanOrEqual(60);
        expect(mouth.width, id).toBeLessThanOrEqual(12);
      }
    }
    expect(() => jawMouth("unknown")).toThrow("No gummy mouth for unknown");
  });
});
