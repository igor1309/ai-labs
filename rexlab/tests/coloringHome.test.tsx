import { ARTWORKS, artworkFor } from "../src/coloring/artworks.ts";
import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, onTestFinished, vi } from "vitest";
import { App } from "../src/App.tsx";
import { browserInput } from "../src/root.ts";
import { InputArbitrationContext } from "../src/inputArbitration.ts";
import { coloringWorkshop } from "../src/coloringWorkshop.ts";
import type { GalleryCollection, GallerySource } from "../src/coloringGallery.ts";
import type { AgeLevel } from "../src/ageLevel.ts";
import type { HomeGame } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { coloringFixture, galleryArtworkFixtures } from "./coloringFixture.ts";
import { SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyLabyrinth, emptyPairs, emptyProgress, emptySkeletons, emptySorting, englishDevice, fakeBodyPicture, featuring, lightDevice, loadedPictures, manualViewport, pageAtRest, seededRandom } from "./support.ts";

function fixture({ language = "en", featured = "compare", level = "explorer" }: { language?: Language; featured?: HomeGame; level?: AgeLevel } = {}) {
  const { model, dot, thumbnail } = coloringFixture();
  let collection: GalleryCollection = { works: [], unavailable: [], completedCount: 4, recentId: null };
  let failure = false;
  let deferred: Promise<GalleryCollection> | undefined;
  let identity = 0;
  const countStart = vi.fn();
  const saveAge = vi.fn();
  let active!: ReturnType<typeof coloringWorkshop>;
  const source: GallerySource = {
    list: vi.fn(async () => { if (deferred) return deferred; if (failure) throw new Error("denied"); return collection; }),
    reset: vi.fn(async () => {}),
    open: vi.fn(async () => { throw new Error("no work"); }),
    newWork: vi.fn(async (id, navigate, geometry) => {
      const selected = geometry ? coloringFixture(artworkFor(geometry).geometry.artwork).model : model;
      active = coloringWorkshop(selected.newWork(id), null, { model: selected, navigate, thumbnail: async () => thumbnail(), write: async () => {}, complete: async () => {
        collection = { ...collection, completedCount: 5 }; return { earned: true, completedCount: 5 };
      } });
      return active;
    })
  };
  const input = browserInput(window); onTestFinished(input.stop);
  const viewport = manualViewport("landscape");
  const props = { ...emptyCare(), ...emptyDig(), ...emptyLabyrinth(), ...emptyPairs(), ...emptySkeletons(), ...emptySorting(), ...englishDevice(), ...lightDevice(), ...loadedPictures(), ...pageAtRest(), ...featuring(featured),
    dinosaurs: SHIPPED_DINOSAURS, catalogue: SHIPPED_CATALOGUE, bodyPicture: fakeBodyPicture, random: seededRandom(7), progress: emptyProgress(), portraitLayouts: {}, viewport,
    languageStore: { load: () => language, save: vi.fn() }, ageLevelStore: { load: () => ({ level, revision: "parent" }), save: saveAge },
    coloring: { source, artworks: ARTWORKS.map(({ geometry, names }) => ({ ...galleryArtworkFixtures()[0]!, version: geometry.artwork.version, names })), painterFor: () => ({ width: 920, height: 620, render: vi.fn(), preview: vi.fn(), regionAt: () => "body" }), identity: () => `work-${++identity}` }, startCounter: { countStart }
  };
  const view = render(<StrictMode><InputArbitrationContext value={input.arbitrate}><App {...props} /></InputArbitrationContext></StrictMode>);
  const click = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); }); };
  return { ...view, artworks: props.coloring.artworks, defer: (value: Promise<GalleryCollection>) => { deferred = value; }, viewport, click, countStart, source, saveAge, dot, active: () => active, fail: (value: boolean) => { failure = value; }, collection: (value: GalleryCollection) => { collection = value; } };
}

it.each(["en", "ru"] as Language[])("shares the durable count and drawing symbol between the %s tile and featured card", async language => {
  for (const featured of ["compare", "coloring"] as const) {
    const f = fixture({ language, featured }); await act(async () => {});
    const entry = screen.getByRole("button", { name: language === "en" ? "COLOR A DINOSAUR" : "РАСКРАСЬ ДИНОЗАВРА" });
    expect(entry.querySelector(".lucide-pencil")).not.toBeNull();
    expect(entry.querySelector(".coloring-tile-count, .featured-card-badge")?.textContent).toBe("4");
    await act(async () => { fireEvent.click(entry); });
    expect(screen.getByRole("region", { name: language === "en" ? "MY ART" : "МОИ РАБОТЫ" })).toBeTruthy();
    expect(f.countStart).not.toHaveBeenCalled(); f.unmount();
  }
});

it.each(["hatchling", "explorer", "paleontologist"] as AgeLevel[])("counts only new work, refreshes Home after completion and retains the parent's %s setting", async level => {
  const f = fixture({ level }); await act(async () => {});
  await f.click("COLOR A DINOSAUR"); await f.click("NEW WORK");
  expect(f.countStart.mock.calls).toEqual([["coloring"]]);
  const session = f.active();
  act(() => f.viewport.resize("wide-short", false));
  expect(f.active()).toBe(session);
  act(() => session.append(f.dot)); await act(async () => { await session.settled(); });
  await f.click("DONE"); await act(async () => { await session.settled(); });
  expect(screen.getByLabelText("COLLECTION").textContent).toContain("5");
  await f.click("HOME");
  expect(f.container.querySelector(".coloring-tile-count")?.textContent).toBe("5");
  expect(f.countStart.mock.calls).toEqual([["coloring"]]); expect(f.saveAge).not.toHaveBeenCalled();
  await f.click("ANCIENT REPTILES");
  expect(f.container.querySelector(".coloring-tile-count, .gallery-count, .coloring-result-count")).toBeNull();
  expect(f.saveAge).not.toHaveBeenCalled();
});

it("shows unknown history as unknown, keeps coloring reachable, and refreshes after retry", async () => {
  const f = fixture(); await act(async () => {});
  await f.click("COLOR A DINOSAUR"); f.fail(true); await f.click("HOME");
  expect(f.container.querySelector(".coloring-tile-count")?.textContent).toBe("?");
  await f.click("COLOR A DINOSAUR");
  expect(screen.getByRole("alert")).toBeTruthy();
  expect((screen.getByRole("button", { name: "NEW WORK" }) as HTMLButtonElement).disabled).toBe(true);
  f.fail(false); await f.click("RETRY"); await f.click("HOME");
  expect(f.container.querySelector(".coloring-tile-count")?.textContent).toBe("4");
  expect(f.countStart).not.toHaveBeenCalled();
});

it("uses the source's history count even when a completed work has unreadable paint", async () => {
  const f = fixture(); await act(async () => {});
  await f.click("COLOR A DINOSAUR"); f.collection({ works: [], unavailable: ["damaged"], recentId: "damaged", completedCount: 7 });
  await f.click("HOME"); expect(f.container.querySelector(".coloring-tile-count")?.textContent).toBe("7");
  await f.click("COLOR A DINOSAUR"); f.collection({ works: [], unavailable: ["damaged"], recentId: "damaged", completedCount: null });
  await f.click("HOME"); expect(f.container.querySelector(".coloring-tile-count")?.textContent).toBe("?");
});

it.each([4, null])("shows no warning while Home history is pending, then shows its settled %s result", async completedCount => {
  const f = fixture(); await act(async () => {}); await f.click("COLOR A DINOSAUR");
  let resolve!: (value: GalleryCollection) => void;
  f.defer(new Promise(done => { resolve = done; }));
  await f.click("HOME");
  expect(f.container.querySelector(".coloring-tile-count")).toBeNull();
  await act(async () => { resolve({ works: [], unavailable: [], recentId: null, completedCount }); });
  expect(f.container.querySelector(".coloring-tile-count")?.textContent).toBe(completedCount === null ? "?" : "4");
});


it.each(["hatchling", "explorer", "paleontologist"] as AgeLevel[])("offers the %s Triceratops through App without a third artwork choice", async level => {
  const f = fixture({ level }); await act(async () => {});
  await f.click("COLOR A DINOSAUR");
  expect(f.container.querySelectorAll(".gallery-new")).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "TRICERATOPS" })).toHaveLength(1);
  await f.click("TRICERATOPS");
  expect(f.active().getSnapshot().work.geometry).toBe(level === "hatchling" ? "triceratops-production-1" : "triceratops-explorer-1");
  expect(screen.getByLabelText("TRICERATOPS").tagName).toBe("CANVAS");
  expect(f.saveAge).not.toHaveBeenCalled();
});

it.each(["hatchling", "explorer", "paleontologist"] as AgeLevel[])("starts the %s Stegosaurus from its matching gallery preview", async level => {
  const f = fixture({ level }); await act(async () => {});
  await f.click("COLOR A DINOSAUR");
  const version = level === "hatchling" ? "stegosaurus-production-1" : "stegosaurus-explorer-1";
  const button = screen.getByRole("button", { name: "NEW WORK" });
  const artwork = f.artworks.find(entry => entry.version === version)!;
  expect(button.textContent).toContain("STEGOSAURUS");
  expect(artwork.preview.render).toHaveBeenLastCalledWith(button.querySelector("canvas"));
  expect(f.container.querySelectorAll(".gallery-new")).toHaveLength(2);
  await f.click("NEW WORK");
  expect(f.source.newWork).toHaveBeenCalledWith("work-1", expect.any(Function), version);
  expect(f.active().getSnapshot().work).toMatchObject({ geometry: version, actions: [] });
  expect(screen.getByLabelText("STEGOSAURUS").tagName).toBe("CANVAS");
  expect(f.saveAge).not.toHaveBeenCalled();
});
