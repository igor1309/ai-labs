import { describe, expect, it } from "vitest";
import { decodedPictures } from "../src/decodedPictures.ts";

// An image whose decoding the test settles, and the source it decoded.
function controlledImage() {
  let settle: (decoded: boolean) => void = () => {};
  const image = {
    src: "",
    decoded: "",
    decode() {
      image.decoded = image.src;
      return new Promise<void>((resolve, reject) => {
        settle = (decoded) => (decoded ? resolve() : reject(new Error("The picture cannot be decoded")));
      });
    },
    settle: (decoded: boolean) => settle(decoded)
  };
  return image;
}

describe("a decoded picture", () => {
  it.each([
    ["decodes", true, "loaded"],
    ["fails to load", false, "failed"]
  ])("is done once, when it %s, saying so", async (_, decoded, outcome) => {
    const image = controlledImage();
    const done: string[] = [];

    decodedPictures(() => image)("/pictures/stegosaurus.webp", (said) => done.push(said));
    await Promise.resolve();
    expect([image.decoded, done]).toEqual(["/pictures/stegosaurus.webp", []]);

    image.settle(decoded);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(done).toEqual([outcome]);
  });
});
