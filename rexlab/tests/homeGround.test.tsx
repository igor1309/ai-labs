import { fireEvent, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { localFeatured, PROGRESS_KEY } from "../src/localProgress.ts";
import { homeTile, memoryStorage } from "./support.ts";
import { openHomeApp } from "./skeletonsApp.tsx";
import { renderHomePageFeaturing } from "./homePage.tsx";

const style = getComputedStyle;
const part = (selector: string) => document.querySelector(selector)!;
afterEach(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.size; });

it.each(["en", "ru"] as const)("shows NEW only on the offered, unfeatured new games in %s", (language) => {
  const { opened } = renderHomePageFeaturing("whoseJaw", { allGames: true, language, newGames: ["whoseJaw", "coloring"] });
  expect(document.querySelectorAll(".home-new")).toHaveLength(1);
  expect(part(".coloring-tile .home-new").getAttribute("aria-label")).toBe(language === "en" ? "NEW" : "НОВИНКА");
  expect(part(".coloring-tile .home-new svg.lucide-sparkles")).not.toBeNull();
  expect(part(".home-sky").querySelector(".home-new")).toBeNull();
  fireEvent.click(part(".coloring-tile .home-new"));
  expect(opened).toEqual(["coloring"]);
});

it.each(["en", "ru"] as const)("shows both new games and a parents' note in %s", (language) => {
  renderHomePageFeaturing("care", { allGames: true, language, newGames: ["whoseJaw", "coloring"] });
  expect([...document.querySelectorAll(".home-new")].map(e => e.closest("button")?.getAttribute("aria-label"))).toEqual(language === "en" ? ["TEETH", "COLOR"] : ["ЗУБЫ", "РАСКРАСЬ"]);
  expect(part(".home-parent-note").textContent).toBe(language === "en"
    ? "Parents: progress is saved on this device. Settings are at the top of the page."
    : "Родителям: прогресс сохраняется на этом устройстве. Настройки — вверху страницы.");
  expect(screen.getByRole("img", { name: language === "en" ? "SOON" : "СКОРО" })).toBe(part(".more-coming"));
  expect(part(".home-version").textContent).toBe("v1.2.3");
  expect(part(".home-version").getAttribute("aria-label")).toBe(language === "en" ? "Version" : "Версия");
});

it("uses the design's earth edge for the deeper band and bedrock", () => {
  const design = JSON.parse(readFileSync(join(import.meta.dirname, "../design/dig-site.pen"), "utf8"));
  const nodes = (node: any): any[] => [node, ...(node.children ?? []).flatMap(nodes)];
  const edge = nodes(design).find(node => node.name === "DS/Layer Edge");
  renderHomePageFeaturing("compare");
  expect([...document.querySelectorAll(".home-earth-wave path")].map(e => e.getAttribute("d"))).toEqual([edge.children[0].geometry, edge.children[0].geometry]);
  expect(document.querySelectorAll(".home-tile-pocket")).toHaveLength(HOME_GAMES.length - 3);
});

it("drops a new game's tag when its start is counted and the child returns home", async () => {
  const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: {
    "home-first-visit": { games: HOME_GAMES.filter(game => game !== "catalogue") }
  } }) });
  const visit = localFeatured(() => storage, HOME_GAMES);
  const { user } = openHomeApp({ storage, startCounter: visit, newHomeGames: visit.newGames });
  expect(homeTile("EXPLORE").querySelector(".home-new")?.getAttribute("aria-label")).toBe("NEW");
  await user.click(homeTile("EXPLORE"));
  await user.click(screen.getByRole("button", { name: "HOME" }));
  expect(homeTile("EXPLORE").querySelector(".home-new")).toBeNull();
  expect(visit.history().timesStarted.get("catalogue")).toBe(1);
});
