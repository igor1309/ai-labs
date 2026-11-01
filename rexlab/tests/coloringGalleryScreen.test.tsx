import { coloringVersionsFor } from "../src/coloringWorkshopRoot.ts";
import { ARTWORKS } from "../src/coloring/artworks.ts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ColoringGalleryScreen } from "../src/ColoringGalleryScreen.tsx";
import { coloringGallery, type GalleryCollection } from "../src/coloringGallery.ts";
import type { ColoringWorkshopSession } from "../src/coloringWorkshop.ts";
import type { Language } from "../src/language/language.ts";
import { coloringFixture, galleryArtworkFixtures } from "./coloringFixture.ts";

beforeEach(() => {
  let id = 0;
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => `blob:art-${++id}`), revokeObjectURL: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
function fixture(language: Language = "en") {
  const { model, dot, thumbnail } = coloringFixture();
  const red = { document: model.complete(model.append(model.newWork("red"), dot)), thumbnail: thumbnail() };
  const blue = { document: model.append(model.newWork("blue"), { ...dot, color: "#42a5f5" }), thumbnail: thumbnail() };
  const collection: GalleryCollection = { works: [blue, red], unavailable: [], recentId: "blue", completedCount: 1 };
  const source = { list: vi.fn(async () => collection), reset: vi.fn(async () => {}), open: vi.fn(async () => ({} as ColoringWorkshopSession)), newWork: vi.fn(async () => ({} as ColoringWorkshopSession)) };
  const home = vi.fn(), workshop = vi.fn(), countStart = vi.fn();
  const session = coloringGallery({ source, identity: () => "fresh", workshop, countStart, navigate: vi.fn() });
  const artworks = galleryArtworkFixtures();
  const view = render(<ColoringGalleryScreen artworks={artworks} session={session} language={language} home={home} />);
  const load = async () => { await act(async () => { await session.load(); }); };
  return { ...view, artworks, source, home, session, load, red, blue, collection, countStart, workshop };
}
it.each(["en", "ru"] as Language[])("shows separate saved thumbnails, statuses, one earned star and the recent continue in %s", async language => {
  const f = fixture(language); await f.load();
  const cards = f.container.querySelectorAll("article");
  expect(cards).toHaveLength(2);
  expect(cards[0]!.getAttribute("data-work-id")).toBe("blue");
  expect(cards[0]!.textContent).toContain(language === "en" ? "DRAFT" : "ЧЕРНОВИК");
  expect(cards[1]!.textContent).toContain(language === "en" ? "COMPLETED" : "ГОТОВО");
  expect(cards[0]!.querySelector(".gallery-earned-star")).toBeNull();
  expect(cards[1]!.querySelector(".gallery-earned-star")).not.toBeNull();
  expect(URL.createObjectURL).toHaveBeenCalledWith(f.blue.thumbnail);
  expect(URL.createObjectURL).toHaveBeenCalledWith(f.red.thumbnail);
  expect(cards[0]!.querySelector("img")!.src).not.toBe(cards[1]!.querySelector("img")!.src);
  for (const button of screen.getAllByRole("button")) {
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.textContent).toBe(button.textContent!.toUpperCase());
  }
  await act(async () => fireEvent.click(screen.getByRole("button", { name: language === "en" ? "CONTINUE" : "ПРОДОЛЖИТЬ" })));
  expect(f.source.open).toHaveBeenCalledWith("blue", expect.any(Function));
  expect(f.countStart).not.toHaveBeenCalled();
});
it("offers new art without inventing progress for an empty collection", async () => {
  const f = fixture(); f.source.list.mockResolvedValue({ works: [], unavailable: [], completedCount: 0, recentId: null });
  await f.load(); expect(screen.queryByRole("button", { name: "CONTINUE" })).toBeNull();
  expect(screen.getByText("LET’S PAINT A DINOSAUR!")).toBeTruthy();
  expect(f.countStart).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "NEW WORK" })));
  expect(f.source.newWork).toHaveBeenCalledWith("fresh", expect.any(Function)); expect(f.countStart).toHaveBeenCalledTimes(1);
});
it("keeps read errors visible with home and retry, never an empty-gallery invitation", async () => {
  const f = fixture(); f.source.list.mockRejectedValueOnce(new Error("unavailable")); await f.load();
  expect(screen.getByRole("alert").textContent).toContain("COULDN’T BE LOADED");
  expect(screen.queryByText("LET’S PAINT A DINOSAUR!")).toBeNull();
  expect((screen.getByRole("button", { name: "NEW WORK" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "HOME" })); expect(f.home).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "RETRY" })));
  expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getAllByRole("img")).toHaveLength(2);
});
it("shows unavailable work with retry beside editable healthy works", async () => {
  const f = fixture(); f.source.list.mockResolvedValue({ ...f.collection, unavailable: ["bad"], recentId: "bad", completedCount: 2 }); await f.load();
  expect(screen.getByText("UNAVAILABLE")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "CONTINUE" })).toBeNull();
  expect((screen.getByRole("button", { name: "NEW WORK" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "PARENT RECOVERY" })).toBeNull();
  await act(async () => fireEvent.click(within(f.container.querySelector('[data-work-id="red"]') as HTMLElement).getByRole("button", { name: "PAINT" })));
  expect(f.source.open).toHaveBeenCalledWith("red", expect.any(Function));
});
it("provides read-only viewing and explicit parent recovery with cancellation, failure and retry", async () => {
  const f = fixture(); f.source.list.mockResolvedValue({ ...f.collection, completedCount: null, unavailable: ["bad"] }); await f.load();
  expect(screen.queryByLabelText("COMPLETED: 1")).toBeNull();
  expect((screen.getByRole("button", { name: "NEW WORK" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getAllByRole("button", { name: /^VIEW$/ })[0]!);
  expect(screen.getByRole("dialog", { name: "VIEW ONLY" })).toBeTruthy();
  expect(f.source.open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "BACK" }));
  fireEvent.click(screen.getByRole("button", { name: "PARENT RECOVERY" }));
  let dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/Resetting deletes all coloring works and earned coloring stars/)).toBeTruthy();
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "CANCEL" }));
  const home = within(dialog).getByRole("button", { name: "HOME" }); home.focus(); fireEvent.keyDown(home, { key: "Tab" });
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "CANCEL" }));
  fireEvent.click(screen.getByRole("button", { name: "CANCEL" })); expect(f.source.reset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "PARENT RECOVERY" }));
  f.source.reset.mockRejectedValueOnce(new Error("quota"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "RESET COLORING" })));
  dialog = screen.getByRole("dialog"); expect(within(dialog).getByRole("alert").textContent).toContain("COULDN’T RESET");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "RESET COLORING" })));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("LET’S PAINT A DINOSAUR!")).toBeTruthy();
  expect(f.countStart).not.toHaveBeenCalled();
});
it("releases thumbnail object URLs on replacement and unmount", async () => {
  const f = fixture(); await f.load(); const urls = ["blob:art-1", "blob:art-2"];
  f.source.list.mockResolvedValue({ ...f.collection, works: [{ ...f.blue, thumbnail: new Blob(["updated"], { type: "image/png" }) }] });
  await f.load(); for (const url of urls) expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  f.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:art-3");
});
it("replaces an undecodable thumbnail with an unavailable placeholder and retry", async () => {
  const f = fixture(); await f.load();
  const card = f.container.querySelector('[data-work-id="blue"]') as HTMLElement;
  fireEvent.error(card.querySelector("img")!);
  expect(card.textContent).toContain("UNAVAILABLE");
  expect(within(card).queryByRole("button", { name: "CONTINUE" })).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("COULDN’T BE LOADED");
  await act(async () => fireEvent.click(within(card).getByRole("button", { name: "RETRY" })));
  expect(card.querySelector("img")).not.toBeNull();
  expect(f.source.open).not.toHaveBeenCalled();
});
it("clears thumbnail warnings after a confirmed reset of unreadable history", async () => {
  const f = fixture(); f.source.list.mockResolvedValue({ ...f.collection, completedCount: null }); await f.load();
  fireEvent.error(f.container.querySelector("img")!);
  fireEvent.click(screen.getByRole("button", { name: "PARENT RECOVERY" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "RESET COLORING" })));
  expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByText("LET’S PAINT A DINOSAUR!")).toBeTruthy();
});
it("offers recovery when no reward history can be read, keeping an unsuccessful reset visible", async () => {
  const f = fixture(); f.source.list.mockRejectedValueOnce(new Error("denied")); await f.load();
  fireEvent.click(screen.getByRole("button", { name: "PARENT RECOVERY" }));
  f.source.reset.mockRejectedValueOnce(new Error("denied"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "RESET COLORING" })));
  expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain("COULDN’T RESET");
  expect(f.source.newWork).not.toHaveBeenCalled(); expect(f.source.open).not.toHaveBeenCalled();
});


it.each(["en", "ru"] as Language[])("offers matching original creature previews and starts Triceratops in %s", async language => {
  const f = fixture(language); await f.load();
  const name = language === "en" ? "TRICERATOPS" : "ТРИЦЕРАТОПС";
  const button = screen.getByRole("button", { name });
  expect(button.textContent).toContain(name);
  expect(f.artworks[1]!.preview.render).toHaveBeenLastCalledWith(button.querySelector("canvas"));
  expect(button.querySelector("canvas")!.width).toBe(276);
  expect(button.querySelector("canvas")!.height).toBe(186);
  const stegosaurus = screen.getByRole("button", { name: language === "en" ? "NEW WORK" : "НОВЫЙ РИСУНОК" });
  expect(stegosaurus.textContent).toContain(language === "en" ? "STEGOSAURUS" : "СТЕГОЗАВР");
  expect(f.artworks[0]!.preview.render).toHaveBeenLastCalledWith(stegosaurus.querySelector("canvas"));
  await act(async () => fireEvent.click(button));
  expect(f.source.newWork).toHaveBeenCalledExactlyOnceWith("fresh", expect.any(Function), "triceratops-production-1");
  expect(f.countStart).toHaveBeenCalledTimes(1);
});


it.each(["en", "ru"] as Language[])("keeps saved creature names and editing across all age choices in %s", async language => {
  for (const level of ["hatchling", "explorer", "paleontologist"] as const) for (const { geometry, names } of ARTWORKS) {
    const version = geometry.artwork.version;
    const works = ARTWORKS.map(({ geometry }) => {
      const { model, dot, thumbnail } = coloringFixture(geometry.artwork);
      return { document: model.append(model.newWork(geometry.artwork.version), dot), thumbnail: thumbnail() };
    });
    const source = { list: async () => ({ works, unavailable: [], completedCount: 0, recentId: null }), reset: vi.fn(), open: vi.fn(async () => ({} as ColoringWorkshopSession)), newWork: vi.fn() };
    const session = coloringGallery({ source, identity: vi.fn(), workshop: vi.fn(), countStart: vi.fn(), navigate: vi.fn() });
    await session.load();
    const artworks = ARTWORKS.map(({ geometry, names }) => ({ ...galleryArtworkFixtures()[0]!, version: geometry.artwork.version, names }));
    const view = render(<ColoringGalleryScreen artworks={artworks} offeredVersions={coloringVersionsFor(level)} session={session} language={language} home={vi.fn()} />);
    expect(view.container.querySelectorAll(".gallery-new")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: language === "en" ? "TRICERATOPS" : "ТРИЦЕРАТОПС" })).toHaveLength(1);
    const name = names[language];
    const card = view.container.querySelector(`[data-work-id="${version}"]`)! as HTMLElement;
    const number = ARTWORKS.findIndex(entry => entry.geometry.artwork.version === version) + 1;
    expect(within(card).getByAltText(`${name} · ${number}`)).toBeTruthy();
    await act(async () => fireEvent.click(within(card).getByRole("button")));
    expect(source.open).toHaveBeenCalledExactlyOnceWith(version, expect.any(Function));
    view.unmount();
  }
});

it.each(["en", "ru"] as Language[])("matches Stegosaurus previews, localized labels and new-work selection at every age in %s", async language => {
  for (const level of ["hatchling", "explorer", "paleontologist"] as const) {
    const source = { list: async () => ({ works: [], unavailable: [], completedCount: 0, recentId: null }), reset: vi.fn(), open: vi.fn(), newWork: vi.fn(async () => ({} as ColoringWorkshopSession)) };
    const countStart = vi.fn();
    const session = coloringGallery({ source, identity: () => "fresh", workshop: vi.fn(), countStart, navigate: vi.fn() });
    await session.load();
    const artworks = ARTWORKS.map(({ geometry, names }) => ({ ...galleryArtworkFixtures()[0]!, version: geometry.artwork.version, names }));
    const view = render(<ColoringGalleryScreen artworks={artworks} offeredVersions={coloringVersionsFor(level)} session={session} language={language} home={vi.fn()} />);
    const version = level === "hatchling" ? "stegosaurus-production-1" : "stegosaurus-explorer-1";
    const selected = artworks.find(artwork => artwork.version === version)!;
    const button = screen.getByRole("button", { name: language === "en" ? "NEW WORK" : "НОВЫЙ РИСУНОК" });
    expect(button.textContent).toContain(language === "en" ? "STEGOSAURUS" : "СТЕГОЗАВР");
    expect(selected.preview.render).toHaveBeenLastCalledWith(button.querySelector("canvas"));
    const other = artworks.find(artwork => artwork.names.en === "STEGOSAURUS" && artwork.version !== version)!;
    expect(other.preview.render).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll(".gallery-new")).toHaveLength(3);
    await act(async () => fireEvent.click(button));
    expect(source.newWork).toHaveBeenCalledExactlyOnceWith("fresh", expect.any(Function), version);
    expect(countStart).toHaveBeenCalledTimes(1);
    view.unmount();
  }
});
