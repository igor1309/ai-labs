import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

const SRC = resolve(import.meta.dirname, "../src");

// Every module under src/, by its path from src/, with the modules under
// src/ it imports.
function importGraph(): Map<string, string[]> {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));
  return new Map(
    files.map((file) => {
      const source = readFileSync(join(SRC, file), "utf8");
      const imported = [...source.matchAll(/^(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']|^import\s+["']([^"']+)["']/gm)]
        .map((match) => match[1] ?? match[2] ?? "")
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => relative(SRC, resolve(SRC, dirname(file), specifier)));
      return [file, imported];
    })
  );
}

const GRAPH = importGraph();

// The edges from modules `from` picks to modules `to` picks.
function edges(from: (file: string) => boolean, to: (file: string) => boolean): string[] {
  return [...GRAPH].flatMap(([file, imported]) => (from(file) ? imported.filter(to).map((target) => `${file} -> ${target}`) : []));
}

const inQuiz = (file: string) => file.startsWith("quiz/");
const inCare = (file: string) => file.startsWith("care/");
const inPairs = (file: string) => file.startsWith("pairs/");
const inSorting = (file: string) => file.startsWith("sorting/");
const inSkeletons = (file: string) => file.startsWith("skeletons/");
const inDig = (file: string) => file.startsWith("dig/");
const SCREENS = [
  "CareResultScreen.tsx",
  "CareWelcomeScreen.tsx",
  "CatalogueScreen.tsx",
  "DigBoardScreen.tsx",
  "DigFieldGuideScreen.tsx",
  "DigRevealScreen.tsx",
  "DinosaurPage.tsx",
  "FriendsScreen.tsx",
  "HomePage.tsx",
  "LabyrinthBoardScreen.tsx",
  "LabyrinthResultScreen.tsx",
  "LevelResultScreen.tsx",
  "OrientationGate.tsx",
  "PairsBoardScreen.tsx",
  "PairsResultScreen.tsx",
  "PairsWelcomeScreen.tsx",
  "QuestionScreen.tsx",
  "ResultScreen.tsx",
  "SandWritingScreen.tsx",
  "SkeletonChoiceScreen.tsx",
  "SkeletonMuseumScreen.tsx",
  "SkeletonPuzzleScreen.tsx",
  "SkeletonResultScreen.tsx",
  "SortScreen.tsx",
  "VisitScreen.tsx"
];
const PRESENTATION = [
  ...SCREENS,
  "ageLevelPictures.ts",
  "Button.tsx",
  "DietTag.tsx",
  "DigBar.tsx",
  "Festivity.tsx",
  "LevelOfferDialog.tsx",
  "FoodChips.tsx",
  "ParentMenu.tsx",
  "Picture.tsx",
  "ResultParts.tsx",
  "SharedPicture.tsx",
  "SkeletonBar.tsx",
  "formatValue.ts",
  "useKeptRow.ts",
  "usePointerState.ts"
];
// The catalogue's own model of a dinosaur, apart from the quiz's.
const CATALOGUE = "catalogue.ts";
const ADAPTERS = [
  "decodedPictures.ts",
  "dinosaurPictures.ts",
  "dinosaurs.ts",
  "documentVisibility.ts",
  "itemPictures.ts",
  "localAgeLevel.ts",
  "localLanguage.ts",
  "localProgress.ts",
  "localTheme.ts",
  "mediaAppearance.ts",
  "mediaMotion.ts",
  "mediaViewport.ts",
  "treasurePictures.ts"
];
const COMPOSITION = [
  "App.tsx",
  "careGame.tsx",
  "digGame.tsx",
  "main.tsx",
  "pairsGame.tsx",
  "presentation.ts",
  "quizGame.tsx",
  "root.ts",
  "skeletonGame.tsx",
  "labyrinthGame.tsx",
  "sortingGame.tsx"
];
// The choice of the day's featured game.
const FEATURED = "featured.ts";
// The age levels and how a parent's pick of one is kept.
const AGE_LEVEL = "ageLevel.ts";
// The rule for the level a game starts at, on the age levels alone.
const START_LEVEL = "startLevel.ts";
// The best-score rule the composition root gives every game.
const BEST_SCORE = "bestScore.ts";
// Where screens are kept and their transitions started.
const SCREEN_STATE = "screens.ts";
// The timers of a visit, a board or a puzzle, stopped together as it ends.
const OWNED_TIMERS = "ownedTimers.ts";
// The motion of a screen to its other layout as the window turns, and
// where a row of columns or a list of cards stands through it.
const TURN_MOTION = ["turnMotion.ts", "rowAnchor.ts", "listAnchor.ts"];
// The catalogue's cards in a row and how its chips stand, by the window.
const CATALOGUE_GEOMETRY = ["catalogueColumns.ts", "chipArrangement.ts"];
// How App sets each window's layout through the turn motion.
const LAYOUT_TURNS = "layoutTurns.ts";

describe("the import graph", () => {
  it("keeps maze rules pure and labyrinth presentation independent of the game model", () => {
    expect(GRAPH.get("labyrinth/index.ts")).toEqual([]);
    expect(GRAPH.get("labyrinthGame.tsx")).toContain("labyrinth/index.ts");
    expect(edges((file) => file.startsWith("labyrinth/"), (target) => !target.startsWith("labyrinth/"))).toEqual([]);
    expect(edges((file) => !file.startsWith("labyrinth/"), (target) => target.startsWith("labyrinth/") && target !== "labyrinth/index.ts")).toEqual([]);
    expect(edges((file) => !["labyrinthGame.tsx", "localProgress.ts"].includes(file), (target) => target === "labyrinth/index.ts")).toEqual([]);
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", (target) => target.startsWith("labyrinth/"))).toEqual([]);
  });

  it("wires labyrinth only through its game module and browser composition root", () => {
    expect(GRAPH.get("App.tsx")).toContain("labyrinthGame.tsx");
    expect(GRAPH.get("root.ts")).toContain("localProgress.ts");
    expect(edges((file) => file !== "App.tsx", (target) => target === "labyrinthGame.tsx")).toEqual([]);
    expect(GRAPH.get("labyrinthGame.tsx")).toEqual(expect.arrayContaining([
      "LabyrinthBoardScreen.tsx", "LabyrinthResultScreen.tsx", "screens.ts", "startLevel.ts", "levelOffer.ts", BEST_SCORE
    ]));
    expect(edges((file) => file === "labyrinthGame.tsx", (target) => ADAPTERS.includes(target))).toEqual([]);
  });

  it("is read from the source", () => {
    expect(GRAPH.get("quizGame.tsx")).toContain("quiz/index.ts");
    expect(GRAPH.get("main.tsx")).toContain("root.ts");
  });

  it("reaches the quiz only through its entrypoint", () => {
    expect(edges((file) => !inQuiz(file), (target) => inQuiz(target) && target !== "quiz/index.ts")).toEqual([]);
  });

  it("keeps screens, formatting, texts and themes free of the quiz", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", inQuiz)).toEqual([]);
  });

  it("reaches dinosaur care only through its entrypoint", () => {
    expect(GRAPH.get("careGame.tsx")).toContain("care/index.ts");
    expect(edges((file) => !inCare(file), (target) => inCare(target) && target !== "care/index.ts")).toEqual([]);
  });

  it("keeps screens, formatting, texts and themes free of dinosaur care", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", inCare)).toEqual([]);
  });

  // The empty bowl is a picture of the visit screen's, not something care
  // gives or a need asks for.
  it("keeps the visit screen's pictures out of dinosaur care", () => {
    const care = [...GRAPH.keys()].filter(inCare);

    expect(care).toContain("care/index.ts");
    expect(care.filter((file) => /\bbowl\b/i.test(readFileSync(join(SRC, file), "utf8")))).toEqual([]);
  });

  it("keeps dinosaur care free of all but the languages", () => {
    expect(edges(inCare, (target) => !inCare(target) && !target.startsWith("language/"))).toEqual([]);
  });

  it("reaches the sorting game only through its entrypoint", () => {
    expect(GRAPH.get("presentation.ts")).toContain("sorting/index.ts");
    expect(GRAPH.get("sortingGame.tsx")).toContain("sorting/index.ts");
    expect(GRAPH.get("dinosaurs.ts")).toContain("sorting/index.ts");
    expect(edges((file) => !inSorting(file), (target) => inSorting(target) && target !== "sorting/index.ts")).toEqual([]);
  });

  it("keeps screens, formatting, texts and themes free of the sorting game", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", inSorting)).toEqual([]);
  });

  it("keeps the sorting game free of all but the languages", () => {
    expect(edges(inSorting, (target) => !inSorting(target) && !target.startsWith("language/"))).toEqual([]);
  });

  it("keeps the quiz free of all but the languages", () => {
    expect(GRAPH.get("quiz/index.ts")).toBeDefined();
    expect(edges(inQuiz, (target) => !inQuiz(target) && !target.startsWith("language/"))).toEqual([]);
  });

  // Each game declares the best-score rule it is scored by; only the
  // composition root names the one rule, which is free of the rest of the
  // app.
  it("leaves the one best-score rule to the composition root, which gives it to each game", () => {
    expect(["careGame.tsx", "quizGame.tsx", "skeletonGame.tsx", "sortingGame.tsx", "labyrinthGame.tsx"].filter((file) => !GRAPH.get(file)?.includes(BEST_SCORE))).toEqual([]);
    expect(edges((file) => !COMPOSITION.includes(file), (target) => target === BEST_SCORE)).toEqual([]);
    expect(edges((file) => file === BEST_SCORE, () => true)).toEqual([]);
  });

  it("reaches find the pair only through its entrypoint", () => {
    expect(GRAPH.get("pairsGame.tsx")).toContain("pairs/index.ts");
    expect(edges((file) => !inPairs(file), (target) => inPairs(target) && target !== "pairs/index.ts")).toEqual([]);
  });

  it("keeps screens, formatting, texts and themes free of find the pair", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", inPairs)).toEqual([]);
  });

  it("keeps find the pair free of all but the languages", () => {
    expect(GRAPH.get("pairs/index.ts")).toBeDefined();
    expect(edges(inPairs, (target) => !inPairs(target) && !target.startsWith("language/"))).toEqual([]);
  });

  it("reaches the skeleton game only through its entrypoint", () => {
    expect(GRAPH.get("skeletonGame.tsx")).toContain("skeletons/index.ts");
    expect(edges((file) => !inSkeletons(file), (target) => inSkeletons(target) && target !== "skeletons/index.ts")).toEqual([]);
  });

  it("keeps screens, formatting, texts and themes free of the skeleton game", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", inSkeletons)).toEqual([]);
  });

  it("keeps the skeleton game free of all but the languages", () => {
    expect(GRAPH.get("skeletons/index.ts")).toBeDefined();
    expect(edges(inSkeletons, (target) => !inSkeletons(target) && !target.startsWith("language/"))).toEqual([]);
  });

  it("reaches the dig game only through its entrypoint", () => {
    expect(GRAPH.get("digGame.tsx")).toContain("dig/index.ts");
    expect(edges((file) => !inDig(file), (target) => inDig(target) && target !== "dig/index.ts")).toEqual([]);
  });

  it("keeps screens, formatting, texts and themes free of the dig game", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", inDig)).toEqual([]);
  });

  it("keeps the dig game free of all but the languages", () => {
    expect(GRAPH.get("dig/index.ts")).toBeDefined();
    expect(edges(inDig, (target) => !inDig(target) && !target.startsWith("language/"))).toEqual([]);
  });

  it("keeps screens, formatting, texts and themes free of the catalogue's model", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", (target) => target === CATALOGUE)).toEqual([]);
  });

  it("keeps the catalogue's model free of all but the languages", () => {
    expect(GRAPH.get(CATALOGUE)).toBeDefined();
    expect(edges((file) => file === CATALOGUE, (target) => !target.startsWith("language/"))).toEqual([]);
  });

  it("keeps the featured choice free of the rest of the app", () => {
    expect(GRAPH.get("App.tsx")).toContain(FEATURED);
    expect(edges((file) => file === FEATURED, () => true)).toEqual([]);
  });

  it("keeps the age levels free of the rest of the app", () => {
    expect(GRAPH.get("App.tsx")).toContain(AGE_LEVEL);
    expect(edges((file) => file === AGE_LEVEL, () => true)).toEqual([]);
  });

  it("keeps the start level rule free of all but the age levels", () => {
    expect(GRAPH.get(START_LEVEL)).toEqual([AGE_LEVEL]);
  });

  it("keeps screens, formatting, texts and themes free of the featured choice", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", (target) => target === FEATURED)).toEqual([]);
  });

  it("keeps adapters free of their consumers", () => {
    expect(edges((file) => ADAPTERS.includes(file), (target) => [...SCREENS, ...COMPOSITION].includes(target))).toEqual([]);
  });

  it("keeps the screen state free of the rest of the app", () => {
    expect(GRAPH.get("App.tsx")).toContain(SCREEN_STATE);
    expect(edges((file) => file === SCREEN_STATE, () => true)).toEqual([]);
  });

  it("keeps the timers a game's occurrence owns free of the rest of the app", () => {
    expect(["careGame.tsx", "digGame.tsx", "pairsGame.tsx", "skeletonGame.tsx"].filter((file) => !GRAPH.get(file)?.includes(OWNED_TIMERS))).toEqual([]);
    expect(edges((file) => file === OWNED_TIMERS, () => true)).toEqual([]);
  });

  it("keeps the turn motion and the row's and the list's anchors free of the rest of the app", () => {
    expect(TURN_MOTION.filter((file) => !GRAPH.has(file))).toEqual([]);
    expect(edges((file) => TURN_MOTION.includes(file), () => true)).toEqual([]);
  });

  it("keeps the catalogue's geometry free of the rest of the app", () => {
    expect(CATALOGUE_GEOMETRY.filter((file) => !GRAPH.has(file))).toEqual([]);
    expect(edges((file) => CATALOGUE_GEOMETRY.includes(file), () => true)).toEqual([]);
  });

  it("keeps App's layout turns free of all but the turn motion, and the row's keeping free of all but the row's anchor", () => {
    expect(GRAPH.get("App.tsx")).toContain(LAYOUT_TURNS);
    expect(edges((file) => file === LAYOUT_TURNS, (target) => target !== "turnMotion.ts")).toEqual([]);
    expect(edges((file) => file === "useKeptRow.ts", (target) => target !== "rowAnchor.ts")).toEqual([]);
  });

  it("leaves the composition root to the composition root", () => {
    expect(edges((file) => !COMPOSITION.includes(file), (target) => COMPOSITION.includes(target))).toEqual([]);
  });
});

// The rules screens, their animation and timers follow.
const TAP_SAFETY = "docs/tap-safety.md";

// The modules that keep screens, each with useScreens.
const SCREEN_KEEPERS = ["App.tsx", "careGame.tsx", "digGame.tsx", "pairsGame.tsx", "skeletonGame.tsx", "sortingGame.tsx", "labyrinthGame.tsx"];

// The module that alone reads the browser's clock and timers, and the
// service worker's own root, which runs apart from the app and its taps.
const ROOT = "root.ts";
const WORKER_ROOT = "offline/sw.ts";

// Each way of reading the clock or starting a timer.
const CLOCKS = /\b(setTimeout|setInterval|Date\.now\(\)|performance\.now\(\)|new Date\(\s*\)|timeStamp)/g;

// The module whose picture store alone calls the loader.
const PICTURES = "Picture.tsx";

// Each break, in the modules under `root`, of these Forbidden rules of
// docs/tap-safety.md: a transition started outside the screen state,
// state kept in a module that keeps screens without its type written or
// with a screen's, the clock or a timer read outside the composition
// root, and a wait for pictures or a picture loader named outside the
// picture store.
function tapSafetyBreaks(root: string): string[] {
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .sort();
  return files.flatMap((file) => {
    const source = readFileSync(join(root, file), "utf8");
    const transitions =
      file === SCREEN_STATE
        ? []
        : [...source.matchAll(/\b(startTransition|addTransitionType)\b/g)].map(([name]) => `${file}: ${name} outside src/${SCREEN_STATE}, see ${TAP_SAFETY}`);
    const states = SCREEN_KEEPERS.includes(file)
      ? [...source.matchAll(/\b(useState|useReducer)\s*(?:<(.*?)>)?\s*\(/g)].flatMap(([, hook, type]) => {
          if (type === undefined) return [`${file}: ${hook} without its type written, see ${TAP_SAFETY}`];
          if (/\w*Screen\b/.test(type)) return [`${file}: ${hook}<${type}> keeps a screen outside useScreens, see ${TAP_SAFETY}`];
          return [];
        })
      : [];
    const clocks = file === ROOT || file === WORKER_ROOT ? [] : [...source.matchAll(CLOCKS)].map(([name]) => `${file}: ${name} outside src/${ROOT}, see ${TAP_SAFETY}`);
    const waits = [...source.matchAll(/\bwaitForPictures\b/g)].map(([name]) => `${file}: ${name}, a wait for pictures, see ${TAP_SAFETY}`);
    const loaders = file === PICTURES ? [] : [...source.matchAll(/\bLoadPicture\b/g)].map(([name]) => `${file}: ${name} outside src/${PICTURES}, see ${TAP_SAFETY}`);
    return [...transitions, ...states, ...clocks, ...waits, ...loaders];
  });
}

// A source tree of `files`, by their paths from its root, removed as the
// test ends.
function sourceTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "rexlab-tap-safety-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  }
  return root;
}

describe("tap safety in the source", () => {
  it("is kept by the app", () => {
    expect(tapSafetyBreaks(SRC)).toEqual([]);
  });

  it.each([
    ["HomePage.tsx", 'import { startTransition } from "react";', `HomePage.tsx: startTransition outside src/screens.ts, see ${TAP_SAFETY}`],
    ["care/visit.ts", "addTransitionType(type);", `care/visit.ts: addTransitionType outside src/screens.ts, see ${TAP_SAFETY}`],
    ["App.tsx", "const [open, setOpen] = useState(false);", `App.tsx: useState without its type written, see ${TAP_SAFETY}`],
    ["sortingGame.tsx", "const [board, send] = useReducer(play, first);", `sortingGame.tsx: useReducer without its type written, see ${TAP_SAFETY}`],
    ["careGame.tsx", 'const [screen, setScreen] = useState<CareScreen>({ kind: "welcome" });', `careGame.tsx: useState<CareScreen> keeps a screen outside useScreens, see ${TAP_SAFETY}`],
    ["pairsGame.tsx", "const [screen, setScreen] = useState<PairsScreen | undefined>();", `pairsGame.tsx: useState<PairsScreen | undefined> keeps a screen outside useScreens, see ${TAP_SAFETY}`],
    ["skeletonGame.tsx", "const [screen, send] = useReducer<Reducer<SkeletonScreen, Move>>(move, first);", `skeletonGame.tsx: useReducer<Reducer<SkeletonScreen, Move>> keeps a screen outside useScreens, see ${TAP_SAFETY}`],
    ["App.tsx", "const id = setTimeout(settle, 500);", `App.tsx: setTimeout outside src/root.ts, see ${TAP_SAFETY}`],
    ["pairsGame.tsx", "window.setInterval(tick, 100);", `pairsGame.tsx: setInterval outside src/root.ts, see ${TAP_SAFETY}`],
    ["SortScreen.tsx", "const pressedAt = Date.now();", `SortScreen.tsx: Date.now() outside src/root.ts, see ${TAP_SAFETY}`],
    ["tapFilter.ts", "const at = performance.now();", `tapFilter.ts: performance.now() outside src/root.ts, see ${TAP_SAFETY}`],
    ["offline/offlineWorker.ts", "await new Promise((resolve) => setTimeout(resolve, 3000));", `offline/offlineWorker.ts: setTimeout outside src/root.ts, see ${TAP_SAFETY}`],
    ["HomePage.tsx", "const today = new Date();", `HomePage.tsx: new Date() outside src/root.ts, see ${TAP_SAFETY}`],
    ["skeletons/drag.ts", "const time = event.timeStamp;", `skeletons/drag.ts: timeStamp outside src/root.ts, see ${TAP_SAFETY}`],
    ["skeletonGame.tsx", "waitForPictures(urls, clock, start);", `skeletonGame.tsx: waitForPictures, a wait for pictures, see ${TAP_SAFETY}`],
    ["Picture.tsx", 'export { waitForPictures } from "./pictureWait.ts";', `Picture.tsx: waitForPictures, a wait for pictures, see ${TAP_SAFETY}`],
    ["App.tsx", 'import type { LoadPicture } from "./Picture.tsx";', `App.tsx: LoadPicture outside src/Picture.tsx, see ${TAP_SAFETY}`],
    ["root.ts", "const loadPicture: LoadPicture = decodedPictures(window);", `root.ts: LoadPicture outside src/Picture.tsx, see ${TAP_SAFETY}`]
  ])("fails %s holding `%s`", (file, source, broken) => {
    expect(tapSafetyBreaks(sourceTree({ [file]: source }))).toEqual([broken]);
  });

  it("allows transitions in the screen state, typed state in the modules that keep screens, any state elsewhere, the clock and timers in the composition root and the worker's, a date made from a time, and the picture loader in the picture store", () => {
    const root = sourceTree({
      "root.ts": "setTimeout(fire, ms);\nconst now = () => new Date(Date.now());\nconst time = event.timeStamp;",
      "offline/sw.ts": "wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms))",
      "featured.ts": "const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());",
      "screens.ts": 'import { addTransitionType, startTransition } from "react";\nstartTransition(() => addTransitionType(type));',
      "App.tsx": "const [settling, setSettling] = useState<boolean>(false);\nconst [play, setPlay] = useState<Play>();",
      "HomePage.tsx": "const [open, setOpen] = useState(false);",
      "Picture.tsx": "export type LoadPicture = (url: string, done: (outcome: Outcome) => void) => void;"
    });

    expect(tapSafetyBreaks(root)).toEqual([]);
  });
});
