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
const SCREENS = ["HomePage.tsx", "OrientationGate.tsx", "QuestionScreen.tsx", "ResultScreen.tsx"];
const PRESENTATION = [...SCREENS, "formatValue.ts", "usePointerState.ts"];
const ADAPTERS = ["dinosaurs.ts", "localLanguage.ts", "localProgress.ts", "localTheme.ts", "mediaAppearance.ts", "mediaOrientation.ts"];
const COMPOSITION = ["App.tsx", "main.tsx", "presentation.ts", "root.ts"];

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

  it("keeps adapters free of their consumers", () => {
    expect(edges((file) => ADAPTERS.includes(file), (target) => [...SCREENS, ...COMPOSITION].includes(target))).toEqual([]);
  });

  it("leaves the composition root to the composition root", () => {
    expect(edges((file) => !COMPOSITION.includes(file), (target) => COMPOSITION.includes(target))).toEqual([]);
  });
});
