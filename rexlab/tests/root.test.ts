import { describe, expect, it } from "vitest";
import { dinosaurWordsWidth, keptLines } from "../src/dinosaurPageLayout.ts";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { AGE_LEVEL_KEY } from "../src/localAgeLevel.ts";
import { LANGUAGE_KEY } from "../src/localLanguage.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { THEME_KEY } from "../src/localTheme.ts";
import { TURN_TIMING, appProps, drawnOpacity, extendPart, filterDoubleTaps, pageAnimations, turnFrame } from "../src/root.ts";
import { browserDocument, manualScreenOrientation, manualWindow, mediaQueries, memoryStorage, pictureBrowser, quizSaved, rootInsets } from "./support.ts";

const PORTRAIT = "(orientation: portrait)";
const NARROW = "(max-width: 599.98px)";
const SHORT = "(max-height: 599.98px)";
const DARK = "(prefers-color-scheme: dark)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// A browser whose local and session storage the test reads apart.
function browser({
  local = memoryStorage(),
  language = "en-GB",
  portrait = false,
  narrow = false,
  short = false,
  screenOrientation = undefined as ReturnType<typeof manualScreenOrientation>["orientation"] | undefined,
  dark = false,
  reduced = false,
  visibility = "visible" as DocumentVisibilityState,
  versionFooter = true,
  sideInsets = { left: 0, right: 0 }
} = {}) {
  const media = mediaQueries({ [PORTRAIT]: portrait, [NARROW]: narrow, [SHORT]: short, [DARK]: dark, [REDUCED_MOTION]: reduced });
  const page = browserDocument(visibility, { versionFooter });
  const root = rootInsets(page.document.documentElement, sideInsets);
  return {
    screen: screenOrientation ? { orientation: screenOrientation } : {},
    localStorage: local,
    sessionStorage: memoryStorage(),
    matchMedia: media.matchMedia,
    navigator: { language },
    document: page.document,
    ...root,
    media,
    page,
    ...manualWindow(1024),
    ...pictureBrowser()
  };
}

// A view transition's end, settled by the test.
function settling() {
  let resolve = () => {};
  let reject = (_: Error) => {};
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve: () => resolve(), reject: (error: Error) => reject(error) };
}

const record = (bestScore: number, roundsPlayed: number) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed } } });

describe("the app in a browser", () => {
  // The words of a dinosaur's page leave out a scrollbar that takes room:
  // the window's width less its root's, which an overlay scrollbar leaves
  // whole.
  const wordsRoom = ({ viewport }: ReturnType<typeof appProps>) => {
    const { left, right } = viewport.sideInsets();
    const scrollbar = viewport.scrollbarWidth!();
    const words = dinosaurWordsWidth(viewport.width(), left, right, scrollbar);
    return { scrollbar, words, description: keptLines(words).description };
  };

  it.each([
    ["a reserved", 616, 16, 504, 5],
    ["an overlay", 632, 0, 520, 4]
  ])("gives the app %s scrollbar's room in a 632-pixel window whose root is %i wide", (_, clientWidth, scrollbar, words, description) => {
    const given = browser({ portrait: true });
    given.resize(632);
    Object.assign(given.document.documentElement, { clientWidth });
    expect(wordsRoom(appProps(given))).toEqual({ scrollbar, words, description });
  });

  it("reads the scrollbar's room afresh at each change of the window", () => {
    const given = browser({ portrait: true });
    const props = appProps(given);
    const seen: Array<ReturnType<typeof wordsRoom>> = [];
    const stop = props.viewport.subscribe(() => seen.push(wordsRoom(props)));
    Object.assign(given.document.documentElement, { clientWidth: 696 });
    given.resize(712);
    Object.assign(given.document.documentElement, { clientWidth: 712 });
    given.resize(712);
    stop();
    expect(seen).toEqual([{ scrollbar: 16, words: 584, description: 4 }, { scrollbar: 0, words: 600, description: 4 }]);
  });

  it("reads progress, the chosen language, the chosen theme and the chosen age level from local storage", () => {
    const props = appProps(
      browser({
        local: memoryStorage({
          [PROGRESS_KEY]: record(6, 3),
          [LANGUAGE_KEY]: "ru",
          [THEME_KEY]: "dark",
          [AGE_LEVEL_KEY]: JSON.stringify({ level: "hatchling", revision: "r1" })
        })
      })
    );

    expect(props.progress.load()).toEqual(quizSaved(6, 3));
    expect(props.languageStore.load()).toBe("ru");
    expect(props.themeStore.load()).toBe("dark");
    expect(props.ageLevelStore.load()).toEqual({ level: "hatchling", revision: "r1" });
  });

  it("keeps progress, the chosen language, the chosen theme and the chosen age level in local storage, and nothing in session storage", () => {
    const given = browser();
    const props = appProps(given);

    props.progress.save(quizSaved(4, 1));
    props.languageStore.save("ru");
    props.themeStore.save("light");
    props.ageLevelStore.save({ level: "paleontologist", revision: "r2" });

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 4, explorerBest: null, paleontologistBest: null, roundsPlayed: 1 } } });
    expect(given.localStorage.items.get(LANGUAGE_KEY)).toBe("ru");
    expect(given.localStorage.items.get(THEME_KEY)).toBe("light");
    expect(JSON.parse(given.localStorage.items.get(AGE_LEVEL_KEY) ?? "")).toEqual({ level: "paleontologist", revision: "r2" });
    expect([...given.sessionStorage.items]).toEqual([]);
  });

  it("keeps care progress beside the quiz's in local storage", () => {
    const given = browser({ local: memoryStorage({ [PROGRESS_KEY]: record(6, 3) }) });
    const props = appProps(given);

    props.careProgress.save({ bestScore: 7, visitsFinished: 3, friends: ["triceratops"] });

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 }, "dinosaur-care": { bestScore: 7, visitsFinished: 3, friends: ["triceratops"] } }
    });
    expect(appProps(given).careProgress.load()).toEqual({ bestScore: 7, visitsFinished: 3, friends: ["triceratops"] });
  });

  it("keeps the sorting game's progress beside the quiz's in local storage", () => {
    const given = browser({ local: memoryStorage({ [PROGRESS_KEY]: record(6, 3) }) });
    const props = appProps(given);

    props.sortingProgress.save({ progress: { best: { hatchling: 5, explorer: null, paleontologist: null }, roundsPlayed: 2 }, levelChoice: undefined });

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 }, "sort-dinosaurs": { explorerBest: null, paleontologistBest: null, bestScore: 5, roundsPlayed: 2 } }
    });
    expect(appProps(given).sortingProgress.load()).toEqual({ progress: { best: { hatchling: 5, explorer: null, paleontologist: null }, roundsPlayed: 2 }, levelChoice: undefined });
  });

  it("keeps the skeleton game's stars, best and stands awaiting rebuild beside the other games' progress in local storage", () => {
    const care = { bestScore: 7, visitsFinished: 3, friends: ["triceratops"] };
    const given = browser({
      local: memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 }, "dinosaur-care": care } }) })
    });
    const props = appProps(given);

    props.skeletonProgress.save({ progress: { bestScore: 2, earned: ["tyrannosaurus", "stegosaurus"], rebuilding: ["stegosaurus"], badges: {} }, levelChoice: undefined });

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 },
        "dinosaur-care": care,
        "skeleton-assembly": { bestScore: 2, earned: ["tyrannosaurus", "stegosaurus"], rebuilding: ["stegosaurus"] }
      }
    });
    const reopened = appProps(given);
    expect([reopened.skeletonProgress.load(), reopened.progress.load(), reopened.careProgress.load()]).toEqual([
      { progress: { bestScore: 2, earned: ["tyrannosaurus", "stegosaurus"], rebuilding: ["stegosaurus"], badges: {} }, levelChoice: undefined },
      quizSaved(6, 3),
      care
    ]);
  });

  it("lets every dinosaur of the shipped list visit, and no flying or sea reptile, with its food type", () => {
    const { visitors, catalogue } = appProps(browser());

    expect(visitors.map(({ id }) => id)).toEqual(catalogue.filter(({ group }) => group === "dinosaur").map(({ id }) => id));
    expect(visitors.find(({ id }) => id === "tyrannosaurus")?.diet).toBe("meat");
  });

  it("builds no flying or sea reptile in SKELETONS", () => {
    const { skeletons, catalogue } = appProps(browser());
    const reptiles = catalogue.filter(({ group }) => group !== "dinosaur").map(({ id }) => id);

    expect(reptiles).toHaveLength(10);
    expect(skeletons.filter(({ id }) => reptiles.includes(id))).toEqual([]);
  });

  it("finds each care picture among the shipped files", () => {
    const { itemPicture } = appProps(browser());

    expect(["plants", "meat", "water", "bath", "nest", "bowl"].map((name) => itemPicture(name).replace(/\?.*$/, ""))).toEqual(
      ["plants", "meat", "water", "bath", "nest", "bowl"].map((name) => `/src/assets/care/${name}.webp`)
    );
  });

  it("follows the reduced motion media query each time it asks", () => {
    const given = browser({ reduced: true });
    const { reducedMotion } = appProps(given);
    expect(reducedMotion()).toBe(true);

    given.media.change(REDUCED_MOTION, false);

    expect(reducedMotion()).toBe(false);
  });

  it("moves the page to its other layout through the browser: parts found in the document, measured as laid out, framed and widened by the browser's own means, animated by the browser, the page's own animations and opacity read from it, its frames asked of it, timed by the motion tokens, faded by its view transition until it has finished", async () => {
    const fades: unknown[] = [];
    const ended = settling();
    const given = browser();
    const document = Object.assign(given.document, {
      startViewTransition: ((update: unknown) => (fades.push(update), { finished: ended.promise })) as unknown as Document["startViewTransition"]
    });
    const { layoutMotion } = appProps({ ...given, document });
    const box = { left: 1, top: 2, width: 3, height: 4 };
    const animation = { cancel: () => {}, effect: null };
    const animated: unknown[] = [];
    const part = { getBoundingClientRect: () => box, animate: (...args: unknown[]) => (animated.push(args), animation) } as unknown as Element;
    const change = () => {};
    let finished = 0;

    layoutMotion.startViewTransition(change, () => finished++);

    expect(layoutMotion.parts).toBe(document);
    expect(layoutMotion.measure(part)).toBe(box);
    // A part's frame and the row's window are drawn as homeTurn.test.tsx
    // proves of them, timed by the stylesheet's tokens, which
    // motion.test.ts holds TURN_TIMING to.
    expect([layoutMotion.frame, layoutMotion.extend, layoutMotion.timing]).toEqual([turnFrame, extendPart, TURN_TIMING]);
    expect([layoutMotion.animate(part, [{ translate: "1px 2px" }], { duration: 240 }), animated]).toEqual([animation, [[[{ translate: "1px 2px" }], { duration: 240 }]]]);
    expect([layoutMotion.animations, layoutMotion.opacity]).toEqual([pageAnimations, drawnOpacity]);
    let painted = 0;
    const stop = layoutMotion.nextFrame(() => painted++);
    given.frames[0]?.();
    stop();
    expect([given.frames.length, painted, given.calledOff]).toEqual([1, 1, [0]]);
    expect([fades, finished]).toEqual([[change], 0]);

    ended.resolve();
    await ended.promise;

    expect(finished).toBe(1);
  });

  it("finds the page's own animations on an element by those still running, and finishes each where it ends, an endless one going on", () => {
    const finished: string[] = [];
    const animation = (name: string, playState: AnimationPlayState, endTime: number) =>
      ({ playState, effect: { getComputedTiming: () => ({ endTime }) }, finish: () => void finished.push(name) }) as unknown as Animation;
    const element = { getAnimations: () => [animation("entrance", "running", 320), animation("ended", "finished", 320), animation("shimmer", "running", Infinity), animation("paused", "paused", 320)] };

    const running = pageAnimations(element);
    running.forEach((found) => found.finish());

    expect([running.length, finished]).toEqual([2, ["entrance"]]);
  });

  it.each([
    ["in a window, as the window computes it", { defaultView: { getComputedStyle: () => ({ opacity: "0.25" }) } }, 0.25],
    ["outside any window, as full", { defaultView: null }, 1]
  ])("reads the opacity an element is drawn at %s", (_, ownerDocument, opacity) => {
    expect(drawnOpacity({ ownerDocument } as unknown as Element)).toBe(opacity);
  });

  it("ends the fade once the view transition is skipped, too", async () => {
    const ended = settling();
    const given = browser();
    const document = Object.assign(given.document, { startViewTransition: (() => ({ finished: ended.promise })) as unknown as Document["startViewTransition"] });
    let finished = 0;
    appProps({ ...given, document }).layoutMotion.startViewTransition(
      () => {},
      () => finished++
    );

    ended.reject(new Error("skipped"));
    await ended.promise.catch(() => {});

    expect(finished).toBe(1);
  });

  it("changes the layout at once in a browser with no view transitions, its fade then ended", () => {
    const steps: string[] = [];

    appProps(browser()).layoutMotion.startViewTransition(
      () => steps.push("change"),
      () => steps.push("finished")
    );

    expect(steps).toEqual(["change", "finished"]);
  });

  it.each(["ru-RU", "en-GB"])("takes the device language %s from the browser", (language) => {
    expect(appProps(browser({ language })).deviceLanguage).toBe(language);
  });

  it("gives the catalogue, dinosaur page, the compare quiz's question and result, and find the pair's welcome, board and result, sort's board and result, and the skeleton choice, museum, puzzle, guess and result, every DIG and care screen a portrait layout for a tall window only, and the home page and sand writing for both portrait sizes", () => {
    expect(appProps(browser()).portraitLayouts).toEqual({ home: ["tall", "tall-narrow"], catalogue: ["tall"], dinosaur: ["tall"], "compare-question": ["tall"], "compare-result": ["tall"], "pairs-welcome": ["tall"], "pairs-board": ["tall"], "pairs-result": ["tall"], "sorting-board": ["tall"], "sorting-result": ["tall"], "skeletons-choice": ["tall"], "skeletons-museum": ["tall"], "skeletons-puzzle": ["tall"], "skeletons-guess": ["tall"], "skeletons-result": ["tall"], "dig-board": ["tall"], "dig-question": ["tall"], "dig-reveal": ["tall"], "dig-guide": ["tall"], "care-welcome": ["tall"], "care-visit": ["tall"], "care-friends": ["tall"], "care-result": ["tall"], sandWriting: ["tall", "tall-narrow"] });
  });

  it("wires the window media queries and the screen's own orientation into one viewport", () => {
    const screen = manualScreenOrientation("landscape-primary");
    const given = browser({ screenOrientation: screen.orientation });
    const { viewport } = appProps(given);
    const read = () => [viewport.sizeClass(), viewport.isScreenUpright()];
    const seen: unknown[] = [];
    expect(read()).toEqual(["wide", false]);
    expect(given.media.queries).toEqual([PORTRAIT, NARROW, SHORT, DARK, REDUCED_MOTION]);

    const unsubscribe = viewport.subscribe(() => seen.push(read()));
    given.media.change(SHORT, true);
    given.media.change(PORTRAIT, true);
    given.media.change(NARROW, true);
    screen.turn("portrait-secondary");
    unsubscribe();
    given.media.change(PORTRAIT, false);
    given.media.change(NARROW, false);
    given.media.change(SHORT, false);
    screen.turn("landscape-secondary");

    expect(seen).toEqual([["wide-short", false], ["tall", false], ["tall-narrow", false], ["tall-narrow", true]]);
    expect(read()).toEqual(["wide", false]);
  });

  it("wires the window's width, as it is resized, into the viewport", () => {
    const given = browser();
    const { viewport } = appProps(given);
    const seen: number[] = [];
    expect(viewport.width()).toBe(1024);

    const unsubscribe = viewport.subscribe(() => seen.push(viewport.width()));
    given.resize(820);
    unsubscribe();
    given.resize(1180);

    expect(seen).toEqual([820]);
    expect(viewport.width()).toBe(1180);
  });

  it("reads the window's side safe-area insets from the root's style into the viewport", () => {
    expect(appProps(browser({ sideInsets: { left: 19, right: 13 } })).viewport.sideInsets()).toEqual({ left: 19, right: 13 });
    expect(appProps(browser()).viewport.sideInsets()).toEqual({ left: 0, right: 0 });
  });

  it("measures a chip's parts as laid out, and tells of each font that comes in until unsubscribed", () => {
    const given = browser();
    const fonts = new EventTarget();
    const { chipWidths } = appProps({ ...given, document: Object.assign(given.document, { fonts: fonts as FontFaceSet }) });
    const part = { getBoundingClientRect: () => ({ width: 58.5 }) } as Element;
    let told = 0;

    const unsubscribe = chipWidths.subscribe(() => told++);
    fonts.dispatchEvent(new Event("loadingdone"));
    unsubscribe();
    fonts.dispatchEvent(new Event("loadingdone"));

    expect([chipWidths.width(part), told]).toEqual([58.5, 1]);
  });

  it("uses the window's portrait query for upright on a browser without screen.orientation", () => {
    const given = browser({ portrait: true });
    const { viewport } = appProps(given);
    expect([viewport.sizeClass(), viewport.isScreenUpright()]).toEqual(["tall", true]);
    const seen: boolean[] = [];
    const stop = viewport.subscribe(() => seen.push(viewport.isScreenUpright()));
    given.media.change(PORTRAIT, false);
    stop();
    given.media.change(PORTRAIT, true);
    expect(seen).toEqual([false]);
  });

  it("follows the document's visibility", () => {
    const given = browser({ visibility: "hidden" });
    const { pageVisibility } = appProps(given);
    const seen: boolean[] = [];
    expect(pageVisibility.isHidden()).toBe(true);

    const unsubscribe = pageVisibility.subscribe(() => seen.push(pageVisibility.isHidden()));
    given.page.switchTo("visible");
    given.page.switchTo("hidden");
    unsubscribe();
    given.page.switchTo("visible");

    expect(seen).toEqual([false, true]);
  });

  it("follows the dark colour scheme media query", () => {
    const given = browser({ dark: true });
    const { appearance } = appProps(given);
    const seen: boolean[] = [];
    expect(appearance.isDark()).toBe(true);

    const unsubscribe = appearance.subscribe(() => seen.push(appearance.isDark()));
    given.media.change(DARK, false);
    unsubscribe();
    given.media.change(DARK, true);

    expect(seen).toEqual([false]);
  });

  it("decodes each picture with the browser's own images", () => {
    const given = browser();
    const { pictures } = appProps(given);

    pictures.request("/pictures/stegosaurus.webp");
    pictures.request("/pictures/triceratops.webp");

    expect(given.decoding).toEqual(["/pictures/stegosaurus.webp", "/pictures/triceratops.webp"]);
  });

  it("starts and stops the browser's own timers", () => {
    const given = browser();
    const { startTimer } = appProps(given);
    const fired: number[] = [];

    startTimer(1000, () => fired.push(1000));
    const stop = startTimer(500, () => fired.push(500));
    stop();
    given.timers[0]?.fire();

    expect(given.timers.map(({ ms }) => ms)).toEqual([1000, 500]);
    expect(given.stopped).toEqual([1]);
    expect(fired).toEqual([1000]);
  });

  it("reads the time from the browser's own clock", () => {
    const now = new Date(2026, 9, 18, 23, 59);

    expect(appProps({ ...browser(), ...pictureBrowser(now) }).now()).toEqual(now);
  });

  it("takes the picture close's timing from the stylesheet and its elapsed time from the monotonic clock", () => {
    let time = 42;
    const values: Record<string, string> = { "--motion-screen": "480ms", "--motion-standard": "300ms", "--motion-stagger": "60ms", "--motion-amount": "0.5", "--ease-out": " cubic-bezier(0.1, 1, 0.5, 1) " };
    const { pictureMotion } = appProps({
      ...browser(),
      performance: { now: () => time },
      getComputedStyle: () => ({ getPropertyValue: (name) => values[name] ?? "0px" })
    });
    expect([pictureMotion.duration, pictureMotion.easing, pictureMotion.now()]).toEqual([480, "cubic-bezier(0.1, 1, 0.5, 1)", 42]);
    expect(pictureMotion.slide).toEqual({ duration: 300, delay: 60, distance: 48 });
    time = 130;
    expect(pictureMotion.now()).toBe(130);
  });

  it("keeps start counts and the day's featured game beside the other progress in local storage, for the next visit", () => {
    const given = browser({ local: memoryStorage({ [PROGRESS_KEY]: record(6, 3) }) });
    const visit = appProps(given);
    expect(visit.featuredStore.history()).toEqual({ timesStarted: new Map(), lastFeatured: undefined });

    visit.featuredStore.feature({ game: "care", on: "2026-10-18" });
    visit.startCounter.countStart("care");

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 }, "home-featured": { starts: { care: 1 }, featured: { day: "2026-10-18", game: "care" } } }
    });
    expect(appProps(given).featuredStore.history()).toEqual({ timesStarted: new Map([["care", 1]]), lastFeatured: { game: "care", on: "2026-10-18" } });
    expect([...given.sessionStorage.items]).toEqual([]);
  });

  it("reads the start counts of the home page's games and drops any other's", () => {
    const starts = Object.fromEntries(HOME_GAMES.map((game, at) => [game, at]));
    const given = browser({
      local: memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "home-featured": { starts: { ...starts, fossils: 4 }, featured: { day: "2026-10-18", game: "skeletons" } } } }) })
    });

    expect(appProps(given).featuredStore.history()).toEqual({ timesStarted: new Map(Object.entries(starts)), lastFeatured: { game: "skeletons", on: "2026-10-18" } });
  });

  it("names index.html's version footer", () => {
    const given = browser();

    appProps(given).nameVersion("Версия");

    expect(given.page.footer).toEqual({ "aria-label": "Версия" });
  });

  it("does not start on a page without its version footer", () => {
    expect(() => appProps(browser({ versionFooter: false }))).toThrow("index.html has no #version element");
  });
});

// An event as a browser makes it: its own fields, and its own time.
function browserEvent(type: string, fields: Record<string, number>) {
  const event = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(fields)) Object.defineProperty(event, name, { value });
  return event;
}

const touch = (type: string, timeStamp: number, clientX = 0) => browserEvent(type, { pointerId: 1, clientX, clientY: 0, timeStamp });

describe("the double-tap filter in a browser", () => {
  // The window, with a handler of the app's registered after the filter.
  function page() {
    const target = new EventTarget();
    const stop = filterDoubleTaps(target);
    const handled: string[] = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "click"]) target.addEventListener(type, () => handled.push(type));
    const send = (event: Event) => {
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return { stop, handled, send };
  }

  it("reads each touch by its event's own time and place, and keeps what it swallows from every handler", () => {
    const { handled, send } = page();
    const first = [touch("pointerdown", 0), touch("pointerup", 50), browserEvent("click", { detail: 1 })].map(send);
    const second = [touch("pointerdown", 250), touch("pointermove", 260), touch("pointerup", 300), browserEvent("click", { detail: 1 })].map(send);
    const far = send(touch("pointerdown", 400, 150));

    expect([first, second, far]).toEqual([[false, false, false], [true, true, true, true], false]);
    expect(handled).toEqual(["pointerdown", "pointerup", "click", "pointerdown"]);
  });

  it("lets a click with no detail through, as a key makes it", () => {
    const { handled, send } = page();
    [touch("pointerdown", 0), touch("pointerup", 50), touch("pointerdown", 250), touch("pointercancel", 260)].forEach(send);

    expect(send(browserEvent("click", { detail: 0 }))).toBe(false);
    expect(handled.at(-1)).toBe("click");
  });

  it("filters nothing once taken away", () => {
    const { stop, handled, send } = page();
    stop();
    [touch("pointerdown", 0), touch("pointerup", 50), touch("pointerdown", 250)].forEach(send);

    expect(handled).toEqual(["pointerdown", "pointerup", "pointerdown"]);
  });
});
