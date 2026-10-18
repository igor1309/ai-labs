import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadAhead, Picture, PICTURE_LIMIT, pictureStore, PicturesProvider, type PictureStore } from "../src/Picture.tsx";
import { manualPictures, type ManualPictures } from "./support.ts";

// docs/features/pictures.feature: a picture's place, its loading kept in
// one store and timed by the timer it is given.

const T_REX = "/pictures/tyrannosaurus.webp";
const TRICERATOPS = "/pictures/triceratops.webp";

// `src` shown in one place, named Tyrannosaurus, its pictures loaded by
// hand; `rerender` shows another source in the same place.
function showPicture(src: string, pictures: ManualPictures = manualPictures(), store: PictureStore = pictureStore(pictures.loadPicture)) {
  const place = (shown: string) => (
    <PicturesProvider store={store} startTimer={pictures.startTimer}>
      <Picture className="dinosaur-picture" src={shown} alt="Tyrannosaurus" width={800} height={600} />
    </PicturesProvider>
  );
  const view = render(place(src));
  return { pictures, store, rerender: (shown: string) => view.rerender(place(shown)) };
}

// The place's look, its source, and the name a screen reader reads.
const look = () => {
  const picture = screen.getByRole("img", { name: "Tyrannosaurus" });
  return [picture.dataset.picture, picture.getAttribute("src"), picture.getAttribute("alt")];
};

describe("a picture's place", () => {
  it("shimmers without a source while its picture loads, at the picture's size, then fades it in", () => {
    const { pictures } = showPicture(T_REX);

    expect(look()).toEqual(["loading", null, "Tyrannosaurus"]);
    const picture = screen.getByRole("img");
    expect([picture.className, picture.getAttribute("width"), picture.getAttribute("height"), picture.draggable]).toEqual(["picture dinosaur-picture", "800", "600", false]);
    expect([pictures.loading(), pictures.timers()]).toEqual([[T_REX], [PICTURE_LIMIT]]);

    act(() => pictures.finish(T_REX));

    expect(look()).toEqual(["appearing", T_REX, "Tyrannosaurus"]);
    expect(pictures.timers()).toEqual([]);
  });

  it("shows a picture already loaded at once, asking for it no more", () => {
    const pictures = manualPictures();
    const store = pictureStore(pictures.loadPicture);
    act(() => store.request(T_REX));
    act(() => pictures.finish(T_REX));

    showPicture(T_REX, pictures, store);

    expect(look()).toEqual(["shown", T_REX, "Tyrannosaurus"]);
    expect([pictures.loading(), pictures.timers()]).toEqual([[], []]);
  });

  it("shows the failure look when its picture fails, keeping its name", () => {
    const { pictures } = showPicture(T_REX);

    act(() => pictures.fail(T_REX));

    expect(look()).toEqual(["failed", null, "Tyrannosaurus"]);
    expect(pictures.timers()).toEqual([]);
  });

  it("shows the failure look once its picture has loaded for PICTURE_LIMIT, and fades it in if it loads after", () => {
    const { pictures } = showPicture(T_REX);

    act(() => pictures.fire(PICTURE_LIMIT));

    expect(look()).toEqual(["failed", null, "Tyrannosaurus"]);
    act(() => pictures.finish(T_REX));
    expect(look()).toEqual(["appearing", T_REX, "Tyrannosaurus"]);
  });

  it("waits 8 seconds before the failure look", () => {
    expect(PICTURE_LIMIT).toBe(8000);
  });

  it.each([
    ["shown", (pictures: ManualPictures) => act(() => pictures.finish(T_REX))],
    ["still loading", () => {}]
  ])("shows only the new picture's shimmer when its source changes, the old one %s", (_, before) => {
    const { pictures, store, rerender } = showPicture(T_REX);
    before(pictures);

    rerender(TRICERATOPS);

    expect(look()).toEqual(["loading", null, "Tyrannosaurus"]);
    act(() => {
      store.request(T_REX);
      pictures.finish(T_REX);
    });
    expect(look()).toEqual(["loading", null, "Tyrannosaurus"]);
    act(() => pictures.finish(TRICERATOPS));
    expect(look()).toEqual(["appearing", TRICERATOPS, "Tyrannosaurus"]);
  });

  it("times the new source from when it shows, and not by the old one's limit", () => {
    const { pictures, rerender } = showPicture(T_REX);
    act(() => pictures.fire(PICTURE_LIMIT));

    rerender(TRICERATOPS);

    expect(look()).toEqual(["loading", null, "Tyrannosaurus"]);
    expect(pictures.timers()).toEqual([PICTURE_LIMIT]);
  });

  it("asks for a failed picture again when shown again later, and fades it in", () => {
    const pictures = manualPictures();
    const store = pictureStore(pictures.loadPicture);
    const first = showPicture(T_REX, pictures, store);
    act(() => pictures.fail(T_REX));
    first.rerender(TRICERATOPS);

    first.rerender(T_REX);

    expect(pictures.loading()).toEqual([TRICERATOPS, T_REX]);
    expect(look()).toEqual(["loading", null, "Tyrannosaurus"]);
    act(() => pictures.finish(T_REX));
    expect(look()).toEqual(["appearing", T_REX, "Tyrannosaurus"]);
  });

  it("cannot be shown outside PicturesProvider", () => {
    expect(() => render(<Picture className="dinosaur-picture" src={T_REX} alt="" />)).toThrow("A picture is shown outside PicturesProvider");
  });
});

describe("the pictures of the app", () => {
  it("loads each picture once, however many places and screens ask for it", () => {
    const pictures = manualPictures();
    const store = pictureStore(pictures.loadPicture);

    store.request(T_REX);
    store.request(T_REX);
    pictures.finish(T_REX);
    store.request(T_REX);

    expect([pictures.loading(), store.status(T_REX)]).toEqual([[], "loaded"]);
  });

  it("knows nothing of a picture not asked for", () => {
    expect(pictureStore(manualPictures().loadPicture).status(T_REX)).toBeUndefined();
  });

  it("tells each listener of every change until it stops listening", () => {
    const pictures = manualPictures();
    const store = pictureStore(pictures.loadPicture);
    const heard: string[] = [];
    const stop = store.subscribe(() => heard.push(String(store.status(T_REX))));

    store.request(T_REX);
    pictures.fail(T_REX);
    store.request(T_REX);
    stop();
    pictures.finish(T_REX);

    expect([heard, store.status(T_REX)]).toEqual([["failed", "loading"], "loaded"]);
  });

  it("loads ahead the pictures a screen may show next, once for the same ones", () => {
    const pictures = manualPictures();
    const store = pictureStore(pictures.loadPicture);
    const ahead = (urls: string[]) => (
      <PicturesProvider store={store} startTimer={pictures.startTimer}>
        <LoadAhead urls={urls} />
      </PicturesProvider>
    );
    const { container, rerender } = render(ahead([T_REX, TRICERATOPS]));
    act(() => pictures.fail(T_REX));

    rerender(ahead([T_REX, TRICERATOPS]));
    expect(pictures.loading()).toEqual([TRICERATOPS]);
    rerender(ahead([TRICERATOPS, T_REX]));

    expect([pictures.loading(), container.innerHTML]).toEqual([[TRICERATOPS, T_REX], ""]);
  });
});
