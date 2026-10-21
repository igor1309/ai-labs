import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import type { Diet } from "../src/catalogue.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localPairsProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import type { Theme } from "../src/theme.ts";
import { pairsRecord } from "./pairsApp.tsx";
import {
  PALETTE,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  emptyCare,
  emptyDig,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  featuring,
  loadedPictures,
  manualAppearance,
  manualViewport,
  memoryStorage,
  sameColour,
  seededRandom,
  unreadVersion,
  words,
  unsetAgeLevel
} from "./support.ts";

function openApp({ language = "en", theme = "light", found = [] }: { language?: Language; theme?: Theme; found?: string[] } = {}) {
  const pairs = memoryStorage({ [PROGRESS_KEY]: pairsRecord({ stars: 0, level: 1, boardsOnLevel: 0, best: {}, found }) });
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={new Set()}
      viewport={manualViewport("landscape")}
      progress={emptyProgress()}
      deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
      languageStore={localLanguage(() => memoryStorage())}
      nameVersion={unreadVersion}
      appearance={manualAppearance(theme)}
      themeStore={localTheme(() => memoryStorage())}
      {...unsetAgeLevel()}
      {...loadedPictures()}
      {...emptyCare()}
      {...emptySorting()}
      pals={SHIPPED_PALS}
      pairsProgress={localPairsProgress(() => pairs)}
      {...emptySkeletons()}
      {...emptyDig()}
    />
  );
  return userEvent.setup();
}

type User = ReturnType<typeof userEvent.setup>;

const ofDiet = (diet: Diet) => SHIPPED_CATALOGUE.filter((entry) => entry.diet === diet);
const MEAT = ofDiet("meat");

const chipRow = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].foodChoice });
const chips = (language: Language = "en") => within(chipRow(language)).getAllByRole("button");
const chip = (name: string) => within(chipRow()).getByRole("button", { name });
const chosen = () => chips().filter((each) => each.getAttribute("aria-pressed") === "true").map((each) => each.getAttribute("aria-label"));
const grid = () => screen.getByRole("group", { name: "ANCIENT REPTILES" });
const cardNames = () => within(grid()).getAllByRole("button").map((card) => card.getAttribute("aria-label"));
const position = () => screen.queryByLabelText("NUMBER")?.textContent;
const pageName = () => screen.queryByRole("heading", { level: 1 })?.textContent;
// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

async function openCatalogue(user: User, language: Language = "en") {
  await user.click(screen.getByRole("button", { name: TEXTS[language].catalogueTile }));
}

async function choose(user: User, name: string) {
  await openCatalogue(user);
  await user.click(chip(name));
}

describe("the catalogue's food chips", () => {
  it("are beside HOME, ALL a filter symbol alone, then MEAT, PLANTS and BOTH, each with its symbols and count, ALL chosen, each a tap target at least 44 high", async () => {
    const user = openApp();
    await openCatalogue(user);

    expect(chipRow().previousElementSibling).toBe(screen.getByRole("button", { name: "HOME" }));
    expect(chips().map((each) => [each.getAttribute("aria-label"), symbolsOf(each), words(each)])).toEqual([
      ["ALL", ["funnel"], ""],
      ["MEAT", ["beef"], "MEAT16"],
      ["PLANTS", ["leaf"], "PLANTS23"],
      ["BOTH", ["beef", "leaf"], "BOTH3"]
    ]);
    expect(chosen()).toEqual(["ALL"]);
    for (const each of chips()) {
      expect(parseFloat(getComputedStyle(each).height)).toBeGreaterThanOrEqual(44);
    }
  });

  it.each([
    ["MEAT", "terra"],
    ["PLANTS", "good"],
    ["BOTH", "amber"]
  ])("colour %s like its tag: its symbol in the colour, and filled with it once chosen", async (name, colour) => {
    const user = openApp();
    await openCatalogue(user);
    const symbols = chip(name).querySelector(".food-chip-symbols");
    if (!symbols) throw new Error(`No symbols on ${name}`);
    if (name !== "BOTH") expect(sameColour(getComputedStyle(symbols).color, PALETTE.light[colour] ?? "")).toBe(true);

    await user.click(chip(name));

    expect(sameColour(getComputedStyle(chip(name)).backgroundColor, PALETTE.light[colour] ?? "")).toBe(true);
  });

  it("show only the dinosaurs of the food tapped, in the list's order, and count them", async () => {
    const user = openApp();
    await choose(user, "MEAT");

    expect(chosen()).toEqual(["MEAT"]);
    expect(cardNames()).toEqual(MEAT.map(({ name }) => name.en));
    expect(within(grid()).getAllByRole("img", { name: "MEAT" })).toHaveLength(16);
  });

  it("show every dinosaur again for ALL", async () => {
    const user = openApp();
    await choose(user, "PLANTS");
    expect(cardNames()).toHaveLength(23);

    await user.click(chip("ALL"));

    expect(cardNames()).toEqual(SHIPPED_CATALOGUE.map(({ name }) => name.en));
  });

  it("change nothing when the chosen chip is tapped again", async () => {
    const user = openApp();
    await choose(user, "BOTH");
    const shown = grid();

    await user.click(chip("BOTH"));

    expect(grid()).toBe(shown);
    expect(cardNames()).toEqual(["Gallimimus", "Oviraptor", "Troodon"]);
  });

  it("show no count of the found and no stamps over the artwork", async () => {
    const user = openApp({ found: ["tyrannosaurus", "velociraptor", "triceratops"] });
    await choose(user, "MEAT");

    expect(screen.queryAllByLabelText("FOUND")).toEqual([]);
  });

  it("make a page go round the dinosaurs shown, counting its place among them", async () => {
    const user = openApp();
    await choose(user, "MEAT");
    await user.click(within(grid()).getByRole("button", { name: "Tyrannosaurus" }));
    expect([pageName(), position()]).toEqual(["TYRANNOSAURUS", "1 / 16"]);

    await user.click(screen.getByRole("button", { name: "PREVIOUS" }));
    expect([pageName(), position()]).toEqual([MEAT.at(-1)?.name.en.toUpperCase(), "16 / 16"]);

    await user.click(screen.getByRole("button", { name: "NEXT" }));
    await user.click(screen.getByRole("button", { name: "NEXT" }));
    expect([pageName(), position()]).toEqual(["VELOCIRAPTOR", "2 / 16"]);
  });

  it("stay chosen back from a page, its card in view", async () => {
    const user = openApp();
    await choose(user, "PLANTS");
    const last = ofDiet("plants").at(-1)?.name.en ?? "";
    await user.click(within(grid()).getByRole("button", { name: last }));

    await user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));

    expect(chosen()).toEqual(["PLANTS"]);
    expect(cardNames()).toHaveLength(23);
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toEqual([within(grid()).getByRole("button", { name: last })]);
  });

  it("open on ALL again after HOME", async () => {
    const user = openApp();
    await choose(user, "MEAT");

    await user.click(screen.getByRole("button", { name: "HOME" }));
    await openCatalogue(user);

    expect(chosen()).toEqual(["ALL"]);
    expect(cardNames()).toHaveLength(42);
  });

  it("rise the cards of the food chosen in as a new list, the chosen look moving by the tokens", async () => {
    const user = openApp();
    await choose(user, "MEAT");
    await user.click(screen.getByRole("button", { name: "Tyrannosaurus" }));
    await user.click(screen.getByRole("button", { name: "ANCIENT REPTILES" }));
    expect(grid().dataset.rise).toBeUndefined();
    const before = grid();

    await user.click(chip("BOTH"));

    expect(grid()).not.toBe(before);
    expect(grid().dataset.rise).toBe("true");
    expect(getComputedStyle(chip("BOTH")).transition).toMatch(/^background-color var\(--motion-standard\) var\(--ease-out\)/);
  });

  it.each([
    ["en", ["ALL", "MEAT", "PLANTS", "BOTH"]],
    ["ru", ["ВСЕ", "МЯСО", "РАСТЕНИЯ", "ВСЁ"]]
  ] as const)("read in %s", async (language, names) => {
    const user = openApp({ language });
    await openCatalogue(user, language);

    expect(chips(language).map((each) => each.getAttribute("aria-label"))).toEqual(names);
  });

  it.each(["light", "dark"] as const)("lift the chosen one by a shadow, its outline off, in the %s theme", async (theme) => {
    const user = openApp({ theme });
    await openCatalogue(user);

    const [all, meat] = [chip("ALL"), chip("MEAT")].map((each) => getComputedStyle(each));
    expect([all?.boxShadow, meat?.boxShadow ?? ""].map((shadow) => shadow !== "" && shadow !== "none")).toEqual([true, false]);
    expect(sameColour(all?.outlineColor ?? "", "#00000000")).toBe(true);
  });
});
