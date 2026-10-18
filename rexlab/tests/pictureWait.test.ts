import { describe, expect, it } from "vitest";
import { waitForPictures } from "../src/pictureWait.ts";
import { manualPictures } from "./support.ts";

const LIMIT = 1000;

// Waits for `urls` with manual pictures, counting how often it is ready.
function wait(urls: string[], pictures = manualPictures()) {
  let ready = 0;
  waitForPictures(urls, { ...pictures, limit: LIMIT }, () => ready++);
  return { pictures, ready: () => ready };
}

describe("waiting for pictures", () => {
  it("is ready once every picture has finished, and stops its timer", () => {
    const { pictures, ready } = wait(["/a.webp", "/b.webp"]);
    expect([pictures.loading(), pictures.timers(), ready()]).toEqual([["/a.webp", "/b.webp"], [LIMIT], 0]);

    pictures.finish("/a.webp");
    expect(ready()).toBe(0);
    pictures.finish("/b.webp");

    expect([pictures.timers(), ready()]).toEqual([[], 1]);
  });

  it("is ready once the limit runs out, and not again when the pictures finish late", () => {
    const { pictures, ready } = wait(["/a.webp", "/b.webp"]);
    pictures.finish("/a.webp");

    pictures.fire(LIMIT);
    expect(ready()).toBe(1);
    pictures.finish("/b.webp");

    expect(ready()).toBe(1);
  });

  it("asks once for a picture named twice", () => {
    const { pictures, ready } = wait(["/a.webp", "/a.webp"]);
    expect(pictures.loading()).toEqual(["/a.webp"]);

    pictures.finish("/a.webp");

    expect(ready()).toBe(1);
  });

  it("is ready at once, with no timer, when there is nothing to wait for", () => {
    const { pictures, ready } = wait([]);

    expect([pictures.loading(), pictures.timers(), ready()]).toEqual([[], [], 1]);
  });

  it("starts no timer when every picture finishes as it is asked for", () => {
    const pictures = manualPictures();
    const loadPicture = (_url: string, done: (outcome: "loaded" | "failed") => void) => done("loaded");
    let ready = 0;

    waitForPictures(["/a.webp", "/b.webp"], { loadPicture, startTimer: pictures.startTimer, limit: LIMIT }, () => ready++);

    expect([pictures.timers(), ready]).toEqual([[], 1]);
  });
});
