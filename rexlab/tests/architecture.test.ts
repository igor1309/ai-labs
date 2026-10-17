import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
const SCREENS = [
  "CareResultScreen.tsx",
  "CareWelcomeScreen.tsx",
  "CatalogueScreen.tsx",
  "DinosaurPage.tsx",
  "FriendsScreen.tsx",
  "HomePage.tsx",
  "OrientationGate.tsx",
  "PairsBoardScreen.tsx",
  "PairsResultScreen.tsx",
  "PairsWelcomeScreen.tsx",
  "QuestionScreen.tsx",
  "ResultScreen.tsx",
  "SortScreen.tsx",
  "VisitScreen.tsx"
];
const PRESENTATION = [
  ...SCREENS,
  "DietTag.tsx",
  "Festivity.tsx",
  "ParentMenu.tsx",
  "ResultParts.tsx",
  "SharedPicture.tsx",
  "formatValue.ts",
  "usePointerState.ts"
];
// The catalogue's own model of a dinosaur, apart from the quiz's.
const CATALOGUE = "catalogue.ts";
const ADAPTERS = [
  "decodedPictures.ts",
  "dinosaurPictures.ts",
  "dinosaurs.ts",
  "itemPictures.ts",
  "localLanguage.ts",
  "localProgress.ts",
  "localTheme.ts",
  "mediaAppearance.ts",
  "mediaMotion.ts",
  "mediaOrientation.ts"
];
const COMPOSITION = ["App.tsx", "careGame.tsx", "main.tsx", "pairsGame.tsx", "presentation.ts", "root.ts", "screenChange.ts", "sortingGame.tsx"];
// The best-score rule every game keeps.
const BEST_SCORE = "bestScore.ts";
// What waits for pictures, given how to load them and keep time.
const WAITING = ["pictureWait.ts"];

describe("the import graph", () => {
  it("is read from the source", () => {
    expect(GRAPH.get("App.tsx")).toContain("quiz/index.ts");
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

  it("keeps dinosaur care free of all but the languages and the best-score rule", () => {
    expect(edges(inCare, (target) => !inCare(target) && !target.startsWith("language/") && target !== BEST_SCORE)).toEqual([]);
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

  it("keeps the sorting game free of all but the languages and the best-score rule", () => {
    expect(edges(inSorting, (target) => !inSorting(target) && !target.startsWith("language/") && target !== BEST_SCORE)).toEqual([]);
  });

  it("gives every game's progress the one best-score rule, which is free of the rest of the app", () => {
    expect(["quiz/progress.ts", "care/progress.ts", "sorting/progress.ts"].filter((file) => !GRAPH.get(file)?.includes(BEST_SCORE))).toEqual([]);
    expect(edges((file) => file === BEST_SCORE, () => true)).toEqual([]);
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", (target) => target === BEST_SCORE)).toEqual([]);
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

  it("keeps screens, formatting, texts and themes free of the catalogue's model", () => {
    expect(edges((file) => PRESENTATION.includes(file) || file.startsWith("language/") || file === "theme.ts", (target) => target === CATALOGUE)).toEqual([]);
  });

  it("keeps the catalogue's model free of all but the languages", () => {
    expect(GRAPH.get(CATALOGUE)).toBeDefined();
    expect(edges((file) => file === CATALOGUE, (target) => !target.startsWith("language/"))).toEqual([]);
  });

  it("keeps adapters free of their consumers", () => {
    expect(edges((file) => ADAPTERS.includes(file), (target) => [...SCREENS, ...COMPOSITION, ...WAITING].includes(target))).toEqual([]);
  });

  it("keeps the wait for pictures free of the rest of the app", () => {
    expect(edges((file) => WAITING.includes(file), () => true)).toEqual([]);
  });

  it("leaves the composition root to the composition root", () => {
    expect(edges((file) => !COMPOSITION.includes(file), (target) => COMPOSITION.includes(target))).toEqual([]);
  });
});
