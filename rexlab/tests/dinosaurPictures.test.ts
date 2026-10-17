import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bodyPictures } from "../src/dinosaurPictures.ts";
import { appProps } from "../src/root.ts";
import { SHIPPED_DINOSAURS, mediaQueries, memoryStorage } from "./support.ts";

const ROOT = resolve(import.meta.dirname, "..");

// The agreed size of every body picture (art/style.md).
const BODY_SIZE = { width: 800, height: 600 };

type WebpImage = { width: number; height: number; alpha: boolean };

const fourCC = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
const uint24 = (bytes: Uint8Array, at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);

// The canvas size of a WebP file and whether it has alpha, from the header
// of its first chunk: extended (VP8X), lossless (VP8L) or lossy (VP8).
function readWebp(bytes: Uint8Array): WebpImage {
  if (fourCC(bytes, 0) !== "RIFF" || fourCC(bytes, 8) !== "WEBP") throw new Error("Not a WebP file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (fourCC(bytes, 12)) {
    case "VP8X":
      return { width: uint24(bytes, 24) + 1, height: uint24(bytes, 27) + 1, alpha: ((bytes[20] ?? 0) & 0x10) !== 0 };
    case "VP8L": {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: ((bits >>> 28) & 1) === 1 };
    }
    case "VP8 ":
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, alpha: false };
    default:
      throw new Error(`Unknown WebP chunk ${fourCC(bytes, 12)}`);
  }
}

// A WebP file of one chunk whose header `payload` is.
function webp(chunk: string, payload: number[]): Uint8Array {
  const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
  const le32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24];
  return new Uint8Array([...ascii("RIFF"), ...le32(12 + payload.length), ...ascii("WEBP"), ...ascii(chunk), ...le32(payload.length), ...payload]);
}

const le24 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
const extended = (width: number, height: number, alpha: boolean) => webp("VP8X", [alpha ? 0x10 : 0, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]);
const lossless = (width: number, height: number, alpha: boolean) => {
  const bits = ((width - 1) | ((height - 1) << 14) | ((alpha ? 1 : 0) << 28)) >>> 0;
  return webp("VP8L", [0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, bits >>> 24]);
};
const lossy = (width: number, height: number) => webp("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, width >>> 8, height & 0xff, height >>> 8]);

describe("reading a WebP file's header", () => {
  it.each<[string, Uint8Array, WebpImage]>([
    ["an extended file with alpha", extended(800, 600, true), { width: 800, height: 600, alpha: true }],
    ["an extended file without alpha", extended(1024, 768, false), { width: 1024, height: 768, alpha: false }],
    ["a lossless file with alpha", lossless(640, 480, true), { width: 640, height: 480, alpha: true }],
    ["a lossless file without alpha", lossless(800, 601, false), { width: 800, height: 601, alpha: false }],
    ["a lossy file", lossy(799, 600), { width: 799, height: 600, alpha: false }]
  ])("reads %s", (_, bytes, image) => {
    expect(readWebp(bytes)).toEqual(image);
  });

  it("refuses a file that is not WebP", () => {
    expect(() => readWebp(new TextEncoder().encode("\x89PNG\r\n\x1a\n and more than a header"))).toThrow("Not a WebP file");
  });
});

describe("bodyPictures", () => {
  it("finds each dinosaur's picture by the folder named for its id", () => {
    const pictureOf = bodyPictures(
      {
        "./assets/dinos/stegosaurus/body.webp": "/assets/body-a1.webp",
        "./assets/dinos/compsognathus/body.webp": "/assets/body-b2.webp"
      },
      ["stegosaurus", "compsognathus"]
    );

    expect(pictureOf("stegosaurus")).toBe("/assets/body-a1.webp");
    expect(pictureOf("compsognathus")).toBe("/assets/body-b2.webp");
    expect(() => pictureOf("microraptor")).toThrow("No body picture for microraptor");
  });

  it("fails when it is made, naming every dinosaur with no body picture", () => {
    const files = {
      "./assets/dinos/stegosaurus/body.webp": "/assets/body-a1.webp",
      "./assets/dinos/compsognathus/head.webp": "/assets/head-c3.webp",
      "./assets/dinos/body.webp": "/assets/body-d4.webp"
    };

    expect(() => bodyPictures(files, ["stegosaurus", "compsognathus", "microraptor"])).toThrow("No body picture for compsognathus, microraptor");
  });
});

// The shipped pictures as the app is given them in a browser.
function shippedBodyPicture() {
  const media = mediaQueries({ "(orientation: portrait)": false, "(prefers-color-scheme: dark)": false });
  return appProps({ localStorage: memoryStorage(), matchMedia: media.matchMedia, navigator: { language: "en-GB" } }).bodyPicture;
}

// The file under rexlab/ a picture URL is served from while testing.
const fileOf = (url: string) => join(ROOT, url.replace(/\?.*$/, ""));

describe("every dinosaur in the list", () => {
  const bodyPicture = shippedBodyPicture();
  const pictures = SHIPPED_DINOSAURS.map(({ id }) => ({ id, url: bodyPicture(id) }));

  it("has a body picture of its own, from its folder", () => {
    for (const { id, url } of pictures) {
      expect(fileOf(url)).toBe(join(ROOT, "src/assets/dinos", id, "body.webp"));
    }
    const contents = new Set(pictures.map(({ url }) => readFileSync(fileOf(url)).toString("base64")));
    expect(contents.size).toBe(SHIPPED_DINOSAURS.length);
  });

  it("has a body picture of the agreed size, with alpha", () => {
    const sizes = pictures.map(({ id, url }) => ({ id, ...readWebp(readFileSync(fileOf(url))) }));

    expect(sizes).toEqual(pictures.map(({ id }) => ({ id, ...BODY_SIZE, alpha: true })));
  });

  it("is credited beside the pictures", () => {
    const credits = readFileSync(join(ROOT, "src/assets/dinos/CREDITS.md"), "utf8");

    expect(SHIPPED_DINOSAURS.filter(({ id }) => !credits.includes(`| \`${id}\` |`))).toEqual([]);
  });
});
