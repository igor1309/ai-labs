import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addTransitionType } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App, type Viewport } from "../src/App.tsx";
import { dinosaurWordsWidth, keptLines } from "../src/dinosaurPageLayout.ts";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { CLOSE_DINOSAUR, OPEN_DINOSAUR } from "../src/SharedPicture.tsx";
import { appStylesheet, NO_SAFE_AREA, type SafeArea } from "./stylesheet.ts";
import { recordedSharedPictures } from "./sharedPictures.tsx";
import {
  SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, emptyCare, emptyDig, emptyPairs,
  emptyProgress, emptySkeletons, emptySorting, fakeBodyPicture, featuring,
  lightDevice, loadedPictures, manualViewport, pageAtRest, seededRandom,
  unreadVersion, unsetAgeLevel
} from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

vi.mock("react", async (actual) => {
  const react = await actual<typeof import("react")>();
  return { ...react, addTransitionType: vi.fn(react.addTransitionType) };
});

const WINDOWS = [
  [600, 800, 38], [744, 1133, 49], [768, 1024, 51],
  [820, 1180, 55], [1024, 1366, 64]
] as const;
const part = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

async function openPage(size: WindowSize, {
  language = "en", id = "pachycephalosaurus", insets = NO_SAFE_AREA,
  viewport = manualViewport("portrait", insets)
}: { language?: Language; id?: string; insets?: SafeArea; viewport?: Viewport } = {}) {
  openWindow(...size);
  const pictures = recordedSharedPictures();
  const user = userEvent.setup();
  render(<App
    {...featuring()}
    dinosaurs={SHIPPED_DINOSAURS}
    catalogue={SHIPPED_CATALOGUE}
    bodyPicture={fakeBodyPicture}
    random={seededRandom(11)}
    portraitLayouts={{ home: ["tall"], catalogue: ["tall"], dinosaur: ["tall"] }}
    viewport={viewport}
    progress={emptyProgress()}
    deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
    languageStore={{ load: () => undefined, save: () => {} }}
    nameVersion={unreadVersion}
    {...lightDevice()} {...unsetAgeLevel()} {...loadedPictures()}
    {...emptyCare()} {...emptySorting()} {...emptyPairs()}
    {...emptySkeletons()} {...emptyDig()} {...pageAtRest()}
    pictureTransition={pictures.Transition}
  />);
  await user.click(screen.getByRole("button", { name: TEXTS[language].catalogueTile }));
  const cardPicture = pictures.picture(`dinosaur-${id}`);
  const card = part(`[data-id="${id}"]`);
  await user.click(card);
  return { user, viewport, pictures, cardPicture };
}

// The CSS contracts under which the width and spacing sums hold. jsdom
// does not lay out boxes, so every structural assumption is checked here.
function uprightRules(size: WindowSize, width: number) {
  const at = (selector: string) => styleAt(part(selector), size);
  const page = at(".dinosaur-page");
  const bar = at(".dinosaur-bar");
  const body = at(".dinosaur-body");
  const stage = at(".dinosaur-stage");
  const words = at(".dinosaur-info");
  const about = at(".dinosaur-about");
  expect([...part(".dinosaur-page").children]).toEqual([part(".dinosaur-bar"), part(".dinosaur-body")]);
  expect([...part(".dinosaur-body").children]).toEqual([part(".dinosaur-stage"), part(".dinosaur-info")]);
  expect([...part(".dinosaur-about").children].map((element) => element.className)).toEqual([
    "dinosaur-group", "dinosaur-page-name", "diet-tag", "dinosaur-description", "dinosaur-facts"
  ]);
  expect([page.value("display"), page.value("flex-direction"), body.value("flex-direction")]).toEqual(["flex", "column", "column"]);
  expect([bar.value("display"), bar.value("justify-content"), bar.value("align-items")]).toEqual(["flex", "space-between", "center"]);
  expect([at(".home-button").px("height"), page.rowGap(), body.rowGap()]).toEqual([56, 28, 32]);
  expect([stage.value("display"), stage.value("grid-template-columns"), stage.columnGap(), stage.value("align-items")]).toEqual(["grid", "72px minmax(0, 1fr) 72px", 16, "center"]);
  expect([stage.px("padding-left"), stage.px("padding-right"), stage.px("padding-top"), stage.px("padding-bottom"), stage.px("border-radius")]).toEqual([28, 28, 28, 28, 32]);
  expect([page.px("min-height"), body.value("flex-shrink"), words.value("flex-shrink")]).toEqual([size[1], "0", "0"]);
  expect([stage.px("min-height"), stage.value("flex-shrink"), page.value("overflow-y"), page.value("overscroll-behavior")]).toEqual([248, "0", "auto", "none"]);
  expect(at(".dinosaur-steps").value("display")).toBe("contents");
  for (const [selector, column] of [[".dinosaur-step:first-child", 1], [".dinosaur-step:last-child", 3]] as const) {
    expect([at(selector).px("width"), at(selector).px("height"), at(selector).value("grid-column"), at(selector).value("grid-row")]).toEqual([72, 72, String(column), "1"]);
  }
  expect([at(".dinosaur-stage-art").value("grid-column"), at(".dinosaur-stage-art").value("grid-row"), at(".dinosaur-stage-art").value("aspect-ratio")]).toEqual(["2", "1", "4 / 3"]);
  expect(at(".dinosaur-stage-picture").value("object-fit")).toBe("contain");
  expect([words.value("display"), words.value("flex-direction"), words.rowGap(), about.rowGap()]).toEqual(["flex", "column", 24, 24]);
  expect(at(".dinosaur-group").px("min-height")).toBe(22);
  expect(at(".dinosaur-group").px("line-height")).toBe(22);
  expect(about.rowGap() + at(".dinosaur-group").px("margin-bottom")).toBe(8);
  expect([words.value("container-type"), at(".dinosaur-page-name").value("font-size"), at(".dinosaur-page-name").value("white-space")]).toEqual(["inline-size", "min(64px, 7.8cqi)", "nowrap"]);
  expect(at(".dinosaur-facts").columnGap()).toBe(16);
  expect(at(".dinosaur-facts").value("display")).toBe("flex");
  const fact = at(".dinosaur-fact");
  expect([fact.value("flex-grow"), fact.value("flex-basis"), fact.px("min-width"), fact.value("box-sizing"), fact.value("container-type")]).toEqual(["1", "0px", 0, "border-box", "inline-size"]);
  expect([fact.px("padding-left"), fact.px("padding-right")]).toEqual([24, 24]);
  expect(at(".dinosaur-fact-value").value("white-space")).toBe("nowrap");
  expect(at(".dinosaur-fact-value").value("font-size")).toBe("min(44px, 26cqi)");
  expect([part(".dinosaur-page").dataset.descriptionLines, part(".dinosaur-page").dataset.noteLines]).toEqual([String(keptLines(width).description), String(keptLines(width).note)]);
  expect(part(".dinosaur-description").dataset.lines).toBe(String(keptLines(width).description));
  expect(part(".source-note").dataset.lines).toBe(String(keptLines(width).note));
  expect([at(".dinosaur-description").px("font-size"), at(".dinosaur-description").px("line-height"), at(".source-note").px("font-size"), at(".source-note").px("line-height")]).toEqual([28, 41, 13, 16.5]);
  expect([at(".dinosaur-description").value("font-weight"), at(".source-note").value("font-weight"), at(".dinosaur-page-name").value("font-weight"), at(".dinosaur-fact-value").value("font-weight")]).toEqual(["500", "400", "700", "700"]);
}

describe("the app's dinosaur page upright", () => {
  it.each(WINDOWS)("opens at %i by %i without the gate, with a name in %i-pixel type and the upright structure", async (width, height, name) => {
    await openPage([width, height]);
    expect([document.documentElement.dataset.size, gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual(["tall", false, false]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("PACHYCEPHALOSAURUS");
    expect(screen.getByRole("button", { name: TEXTS.en.catalogue })).toBe(part(".dinosaur-bar .home-button"));
    expect(part(".dinosaur-position").textContent).toBe("10 / 52");
    const words = dinosaurWordsWidth(width, 0, 0);
    expect(Math.abs(Math.min(64, words * 0.078) - name)).toBeLessThanOrEqual(1);
    uprightRules([width, height], words);
  });

  it.each([
    [600, 800, 0, 0, 16, 472, 5, 4],
    [632, 1366, 0, 0, 0, 520, 4, 4],
    [712, 1366, 0, 0, 0, 600, 4, 3],
    [768, 1366, 0, 0, 0, 656, 3, 3],
    [744, 1133, 19, 13, 0, 600, 4, 3]
  ])("takes insets and scrollbar from the viewport at %i by %i (%i left, %i right, %i scrollbar)", async (width, height, left, right, scrollbar, words, description, note) => {
    const viewport = { ...manualViewport("portrait", { left, right }), scrollbarWidth: () => scrollbar };
    await openPage([width, height], { viewport });
    expect(dinosaurWordsWidth(width, left, right, scrollbar)).toBe(words);
    expect([part(".dinosaur-page").dataset.descriptionLines, part(".dinosaur-page").dataset.noteLines]).toEqual([String(description), String(note)]);
  });

  it.each(["en", "ru"] as const)("keeps the group's line on every page in %s, empty for a dinosaur", async (language) => {
    // The app renders and steps through all shipped creatures; fireEvent
    // drives the arrows without adding user-event's pointer machinery.
    await openPage([820, 1180], { language, id: SHIPPED_CATALOGUE[0]!.id });
    for (const creature of SHIPPED_CATALOGUE) {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(creature.name[language].toLocaleUpperCase(language));
      const group = part(".dinosaur-group");
      expect(group.textContent).toBe(creature.group === "dinosaur" ? "" : TEXTS[language].groups[creature.group]);
      expect(group.nextElementSibling).toBe(part(".dinosaur-page-name"));
      expect([getComputedStyle(group).minHeight, getComputedStyle(group).lineHeight, getComputedStyle(group).marginBottom]).toEqual(["22px", "22px", "-16px"]);
      expect([part(".dinosaur-page").dataset.descriptionLines, part(".dinosaur-page").dataset.noteLines]).toEqual(["3", "3"]);
      fireEvent.click(screen.getByRole("button", { name: TEXTS[language].nextDinosaur }));
    }
  });

  it("keeps the group just over the name when Chasmosaurus gives way to Quetzalcoatlus", async () => {
    const { user } = await openPage([820, 1180], { id: "chasmosaurus" });
    uprightRules([820, 1180], 708);
    expect(part(".dinosaur-group").textContent).toBe("");
    await user.click(screen.getByRole("button", { name: TEXTS.en.nextDinosaur }));
    expect(part(".dinosaur-page-name").textContent).toBe("QUETZALCOATLUS");
    expect(part(".dinosaur-group").textContent).toBe(TEXTS.en.groups["flying-reptile"]);
    uprightRules([820, 1180], 708);
  });

  it("shares the card picture with its upright stage, then returns it into its card in view", async () => {
    const { user, pictures, cardPicture } = await openPage([820, 1180], { id: "triceratops" });
    const pagePicture = pictures.picture("dinosaur-triceratops");
    expect(pagePicture.element.classList.contains("dinosaur-stage-picture")).toBe(true);
    expect(pagePicture.element.closest(".dinosaur-stage")).toBe(part(".dinosaur-stage"));
    expect(vi.mocked(addTransitionType).mock.calls.at(-1)).toEqual([OPEN_DINOSAUR]);
    const opening = [cardPicture, pagePicture];
    for (const { props } of opening) {
      expect(props.name).toBe("dinosaur-triceratops");
      expect(props.default).toBe("none");
      expect(props.share).toEqual({ [OPEN_DINOSAUR]: "dinosaur-share", [CLOSE_DINOSAUR]: "dinosaur-share", default: "none" });
    }
    await user.click(screen.getByRole("button", { name: TEXTS.en.catalogue }));
    const returned = pictures.picture("dinosaur-triceratops");
    expect(returned.props.name).toBe(pagePicture.props.name);
    expect(returned.props.share).toEqual(pagePicture.props.share);
    expect(returned.element.classList.contains("catalogue-picture")).toBe(true);
    expect(vi.mocked(addTransitionType).mock.calls.at(-1)).toEqual([CLOSE_DINOSAUR]);
    const list = screen.getByRole("group", { name: TEXTS.en.catalogue });
    const card = within(list).getByRole("button", { name: "Triceratops" });
    expect(returned.element.closest(".catalogue-card")).toBe(card);
    expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts).toEqual([card]);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect([document.documentElement.dataset.size, gateShown(), list.hasAttribute("data-rise"), getComputedStyle(list).getPropertyValue("--columns")]).toEqual(["tall", false, false, "3"]);
  });

  it("fades the turn picture over the page as a tall window narrows", async () => {
    const viewport = manualViewport("portrait");
    await openPage([820, 1180], { id: "triceratops", viewport });
    const page = part(".dinosaur-page");
    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
    expect(part(".dinosaur-page")).toBe(page);
    expect(getComputedStyle(part(".orientation-gate")).animation).toMatch(/^fade-in /);
  });

  it("keeps the landscape structure and type with no gate", async () => {
    await openPage([1024, 768], { viewport: manualViewport("landscape") });
    expect([document.documentElement.dataset.size, gateShown()]).toEqual(["wide", false]);
    expect(getComputedStyle(part(".dinosaur-body")).flexDirection || "row").toBe("row");
    expect([getComputedStyle(part(".dinosaur-stage")).display, getComputedStyle(part(".dinosaur-steps")).display]).toEqual(["flex", "flex"]);
    expect(getComputedStyle(part(".dinosaur-page-name")).fontSize).toBe("min(46px, 8cqi)");
    expect(getComputedStyle(part(".dinosaur-page")).height).toBe("768px");
  });

  it("puts the bar below safe areas and keeps bottom padding above the home indicator, with background to the edges", async () => {
    const insets = { top: 24, right: 13, bottom: 20, left: 19 };
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(insets) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    await openPage([744, 1133], { insets, id: "triceratops" });
    const page = getComputedStyle(part(".dinosaur-page"));
    expect([page.paddingTop, page.paddingRight, page.paddingBottom, page.paddingLeft]).toEqual(["64px", "69px", "68px", "75px"]);
    expect([page.position, page.boxSizing, page.minHeight, page.height, page.margin]).toEqual(["relative", "border-box", "1133px", "auto", "0"]);
    expect(part(".source-note")).toBe(part(".dinosaur-info").lastElementChild);
    // The note ends inside the page's bottom padding, including when
    // scrolling brings the page's bottom level with the viewport's.
    expect(Number.parseFloat(page.paddingBottom)).toBeGreaterThan(insets.bottom);
    expect([getComputedStyle(document.body).margin, getComputedStyle(document.body).backgroundColor]).toEqual(["0px", "rgb(242, 239, 232)"]);
    expect(gateShown()).toBe(false);
  });
});
