import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { itemPictures } from "../src/itemPictures.ts";
import { appProps } from "../src/root.ts";
import { browserQueries, memoryStorage, pictureBrowser, readWebp } from "./support.ts";

const ROOT = resolve(import.meta.dirname, "..");

// Every care picture: the five items and the empty bowl of hunger.
const NAMES = ["plants", "meat", "water", "bath", "nest", "bowl"];

// The agreed size of every care picture.
const ITEM_SIZE = { width: 400, height: 300 };

describe("itemPictures", () => {
  it("finds each care picture by its file's name", () => {
    const itemPicture = itemPictures(
      {
        "./assets/care/meat.webp": "/assets/meat-a1.webp",
        "./assets/care/bowl.webp": "/assets/bowl-b2.webp",
        "./assets/dinos/meat/body.webp": "/assets/body-c3.webp"
      },
      ["meat", "bowl"]
    );

    expect([itemPicture("meat"), itemPicture("bowl")]).toEqual(["/assets/meat-a1.webp", "/assets/bowl-b2.webp"]);
    expect(() => itemPicture("nest")).toThrow("No care picture for nest");
  });

  it("fails when it is made, naming every care picture missing", () => {
    expect(() => itemPictures({ "./assets/care/meat.webp": "/assets/meat-a1.webp", "./assets/care/water.png": "/assets/water.png" }, ["meat", "water", "nest"])).toThrow(
      "No care picture for water, nest"
    );
  });
});

describe("every care picture", () => {
  const itemPicture = appProps({ localStorage: memoryStorage(), matchMedia: browserQueries().matchMedia, navigator: { language: "en-GB" }, ...pictureBrowser() }).itemPicture;
  const fileOf = (name: string) => join(ROOT, itemPicture(name).replace(/\?.*$/, ""));

  it("is a 400×300 WebP with alpha, of its own, read from its file", () => {
    const pictures = NAMES.map((name) => readFileSync(fileOf(name)));

    expect(NAMES.map((name, at) => ({ name, ...readWebp(pictures[at] ?? new Uint8Array()) }))).toEqual(NAMES.map((name) => ({ name, ...ITEM_SIZE, alpha: true })));
    expect(new Set(pictures.map((bytes) => bytes.toString("base64"))).size).toBe(NAMES.length);
  });

  it("is credited beside the pictures", () => {
    const credits = readFileSync(join(ROOT, "src/assets/care/CREDITS.md"), "utf8");

    expect(NAMES.filter((name) => !credits.includes(`| \`${name}\` |`))).toEqual([]);
  });
});
