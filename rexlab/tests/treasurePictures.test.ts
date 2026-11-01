import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TREASURE_KINDS } from "../src/dig/index.ts";
import { TREASURE_PICTURES } from "../src/treasurePictures.ts";
import { readWebp } from "./support.ts";

const ROOT = resolve(import.meta.dirname, "..");

// Each kind's own file, written out apart from the app's map.
const FILES = {
  shell: "src/assets/dig/treasures/shell.webp",
  tooth: "src/assets/dig/treasures/tooth.webp",
  amber: "src/assets/dig/treasures/amber.webp",
  "egg-nest": "src/assets/dig/treasures/egg-nest.webp",
  "golden-fossil": "src/assets/dig/treasures/golden-fossil.webp"
};

// The file under rexlab/ a picture URL is served from while testing.
const fileOf = (url: string) => join(ROOT, url.replace(/\?.*$/, ""));

describe("every treasure picture", () => {
  it("is its kind's own file", () => {
    expect(TREASURE_KINDS.map((kind) => [kind, fileOf(TREASURE_PICTURES[kind])])).toEqual(TREASURE_KINDS.map((kind) => [kind, join(ROOT, FILES[kind])]));
    const contents = new Set(TREASURE_KINDS.map((kind) => readFileSync(join(ROOT, FILES[kind])).toString("base64")));
    expect(contents.size).toBe(TREASURE_KINDS.length);
  });

  it("is a 400×400 WebP with alpha", () => {
    expect(TREASURE_KINDS.map((kind) => ({ kind, ...readWebp(readFileSync(join(ROOT, FILES[kind]))) }))).toEqual(TREASURE_KINDS.map((kind) => ({ kind, width: 400, height: 400, alpha: true })));
  });

  it("is credited beside the pictures", () => {
    const credits = readFileSync(join(ROOT, "src/assets/dig/treasures/CREDITS.md"), "utf8");

    expect(TREASURE_KINDS.filter((kind) => !credits.includes(`| \`${kind}\` |`))).toEqual([]);
  });
});
