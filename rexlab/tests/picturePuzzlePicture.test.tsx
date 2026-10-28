import { createHash } from "node:crypto";
import { act, render } from "@testing-library/react";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { cutPicture, PICTURE_FRAME } from "../src/picturePuzzle/index.ts";
import { PicturePuzzlePicture } from "../src/PicturePuzzlePicture.tsx";
import { withManualPictures, withPictures } from "./pictures.tsx";
import { fakeBodyPicture, manualPictures } from "./support.ts";

const SOURCE = fakeBodyPicture("tyrannosaurus");

describe("the complete picture puzzle scene", () => {
  it("puts distinct decorative detail in every tile, even with the transparent dinosaur absent", async () => {
    const { container } = render(<PicturePuzzlePicture src={SOURCE} />, withPictures);
    const backdrop = container.querySelector("svg")!.cloneNode(true) as SVGElement;
    backdrop.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const { data, info } = await sharp(Buffer.from(backdrop.outerHTML)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([PICTURE_FRAME.width, PICTURE_FRAME.height]);
    expect(data.every((value, at) => at % info.channels !== 3 || value === 255)).toBe(true);
    for (const level of AGE_LEVELS) {
      const signatures = cutPicture(level).pieces.map(({ home: { x, y, width, height } }) => {
        const hash = createHash("sha256");
        const colors = new Set<number>();
        for (let row = y; row < y + height; row++) {
          const pixels = data.subarray((row * info.width + x) * info.channels, (row * info.width + x + width) * info.channels);
          hash.update(pixels);
          for (let at = 0; at < pixels.length; at += info.channels) colors.add(pixels.readUIntBE(at, 3));
        }
        expect(colors.size, `${level} tile ${x},${y} has visible detail`).toBeGreaterThan(3);
        return hash.digest("hex");
      });
      expect(new Set(signatures).size).toBe(signatures.length);
    }
  });

  it("crops the backdrop and unstretched dinosaur together from the same full scene at every cut", () => {
    const view = render(<PicturePuzzlePicture src={SOURCE} />, withPictures);
    const backdrop = view.container.querySelector("svg")!.outerHTML;
    for (const level of AGE_LEVELS) {
      for (const { home } of cutPicture(level).pieces) {
        view.rerender(<PicturePuzzlePicture src={SOURCE} crop={home} />);
        const crop = view.container.querySelector<HTMLElement>(".picture-puzzle-crop")!;
        const scene = crop.querySelector<HTMLElement>(".picture-puzzle-scene")!;
        expect(crop.style.aspectRatio).toBe(`${home.width} / ${home.height}`);
        expect(["width", "height", "left", "top"].map((part) => crop.style.getPropertyValue(`--scene-${part}`))).toEqual([
          `${PICTURE_FRAME.width / home.width * 100}%`, `${PICTURE_FRAME.height / home.height * 100}%`,
          `${-home.x / home.width * 100}%`, `${-home.y / home.height * 100}%`
        ]);
        const style = getComputedStyle(scene);
        expect([style.width, style.height, style.left, style.top]).toEqual([
          "var(--scene-width)", "var(--scene-height)", "var(--scene-left)", "var(--scene-top)"
        ]);
        expect(scene.querySelector("svg")!.outerHTML).toBe(backdrop);
        expect(getComputedStyle(scene.querySelector("img")!).objectFit).toBe("contain");
      }
    }
  });

  it("uses shared picture loading and failure states while keeping the scene's place", () => {
    const pictures = manualPictures();
    const { container } = render(<PicturePuzzlePicture src={SOURCE} />, withManualPictures(pictures));
    const image = container.querySelector("img")!;
    expect([image.dataset.picture, image.getAttribute("src")]).toEqual(["loading", null]);
    expect(container.querySelector<HTMLElement>(".picture-puzzle-crop")!.style.aspectRatio).toBe("1200 / 900");
    act(() => pictures.fail(SOURCE));
    expect([image.dataset.picture, image.getAttribute("src")]).toEqual(["failed", null]);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
