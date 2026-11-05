import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "../src");

// Each screen's root, by the classes its <main> can carry, as the
// components write them, and the portrait gate that covers a screen.
export const SCREEN_ROOTS = [
  ...new Set(
    readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) => [...readFileSync(join(SRC, file), "utf8").matchAll(/<main\b[^>]*?\bclassName=(\{[^}]*\}|"[^"]*")/g)])
      .flatMap(([, className]) => [...(className ?? "").matchAll(/"([^"]+)"/g)].map(([, classes]) => classes ?? ""))
  ),
  "orientation-gate"
];

// A screen's root, empty, in the test document.
export function screenRoot(classes: string) {
  const root = document.createElement(classes === "orientation-gate" ? "div" : "main");
  root.className = classes;
  document.body.append(root);
  return root;
}

// The fixed parts at the window's edges, each with the sides it keeps
// its offsets from.
export const EDGE_PARTS = [
  ["the version footer", "footer", { id: "version" }, ["right", "bottom"]],
  ["the wordmark", "p", { className: "wordmark" }, ["top", "left"]],
  ["the home corner", "div", { className: "home-corner" }, ["top", "right"]]
] as const;

// One of the fixed parts, in the test document.
export function edgePart(tag: string, attributes: { id?: string; className?: string }) {
  const part = Object.assign(document.createElement(tag), attributes);
  document.body.append(part);
  return part;
}

// The dig-site screens pad their sky and their scrolling content rather
// than their root, so the earth and its waves can reach both window edges.
const DIG_SITE_CONTENT: Record<string, string[]> = {
  "friends-dig-site": ["friends-sky", "friends-grid", "no-friends"],
  "whose-jaw-welcome": ["whose-jaw-welcome-sky", "whose-jaw-welcome-body"],
  "pairs-welcome": ["pairs-welcome-sky", "pairs-welcome-body"],
  "whose-jaw-board": ["whose-jaw-board-sky", "jaw-sand-body"]
};

// Whether a screen's root pads parts of its own, not itself.
export function padsItsParts(root: HTMLElement) {
  return Object.keys(DIG_SITE_CONTENT).some(className => root.classList.contains(className));
}

export function contentRoots(root: HTMLElement): HTMLElement[] {
  const parts = Object.entries(DIG_SITE_CONTENT).find(([className]) => root.classList.contains(className))?.[1];
  if (!parts) return [root];
  return parts.map(className => {
    const part = document.createElement("div");
    part.className = className;
    root.append(part);
    return part;
  });
}
