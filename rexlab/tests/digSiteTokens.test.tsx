import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { CSSProperties } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { GameAudioButton } from "../src/GameAudioButton.tsx";
import { LevelBadge } from "../src/LevelBadge.tsx";
import { LevelSwitch } from "../src/LevelSwitch.tsx";
import { LevelOfferDialog } from "../src/LevelOfferDialog.tsx";
import { ParentMenu } from "../src/ParentMenu.tsx";
import { BestScore, CelebrationChip, ScoreCount } from "../src/ResultParts.tsx";
import { OrientationGate } from "../src/OrientationGate.tsx";

const design = JSON.parse(readFileSync(join(import.meta.dirname, "../design/dig-site.pen"), "utf8"));
const noop = () => {};
const startTimer = () => noop;

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.size;
});

function token(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(`--ds-${name}`).trim(); }
function literal(property: string, value: string) {
  const element = document.createElement("span");
  element.style.setProperty(property, value);
  return getComputedStyle(element).getPropertyValue(property);
}
function matches(element: Element, properties: Record<string, string>) {
  const style = getComputedStyle(element);
  for (const [property, name] of Object.entries(properties)) {
    expect(style.getPropertyValue(property), `${element.className}: ${property}`).toBe(literal(property, token(name)));
  }
}
function part(selector: string) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

for (const theme of ["light", "dark"]) for (const size of ["wide", "tall", "tall-narrow", "wide-short"]) {
  test(`dig-site tokens match every design variable in ${theme}, ${size}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = size;
    const device = size === "tall-narrow" || size === "wide-short" ? "phone" : "ipad";
    for (const [name, entry] of Object.entries(design.variables) as [string, { type: string; value: string | number | { value: string | number; theme: { mode?: string; device?: string } }[] }][]) {
      const value = Array.isArray(entry.value) ? entry.value.find(({ theme: axis }) => axis.mode === theme || axis.device === device)!.value : entry.value;
      expect(token(name.slice(3)), name).toBe(name === "ds-font" ? '"Lexend Variable",system-ui,sans-serif' : `${value}${entry.type === "number" ? "px" : ""}`);
    }
  });

  test(`shared parts compute their dig-site faces in ${theme}, ${size}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = size;
    render(<>
      <GameAudioButton language="en" muted={false} onToggle={noop} />
      <LevelBadge language="en" badge="explorer" />
      <LevelSwitch language="en" level="explorer" onLevel={noop} />
      <ScoreCount language="en" score={7} total={10} />
      <BestScore language="en" best={8} beaten={6} />
      <CelebrationChip language="en" celebration="new-best" />
      <ParentMenu label="Language" button="EN" choices={[{ value: "en", name: "English", note: "Parents" }, { value: "ru", name: "Русский" }]} chosen="en" open onOpen={noop} onClose={noop} onChoose={noop} startTimer={startTimer} />
      <LevelOfferDialog language="en" offer={{ level: "explorer", onYes: noop, onNotNow: noop, onShown: noop, startTimer }} leaving={false} onShown={noop} onAnswer={noop} onGone={noop} />
      <OrientationGate shown screenUpright language="en"><div /></OrientationGate>
    </>);
    matches(part(".game-audio-button"), { "background-color": "quiet", color: "ink", "border-radius": "radius-pill" });
    matches(part(".level-badge"), { "background-color": "strong", color: "on-strong", "border-radius": "radius-tag" });
    matches(part(".celebration"), { "background-color": "reward", color: "on-reward", "border-radius": "radius-tag", "font-size": "size-tag" });
    matches(part(".level-switch"), { "background-color": "quiet", "border-radius": "radius-pill", padding: "level-pad" });
    matches(part('.level-switch-level[aria-pressed="true"]'), { "background-color": "strong", color: "on-strong", "font-size": "size-tag" });
    matches(part('.level-switch-level[aria-pressed="false"]'), { color: "ink" });
    expect(getComputedStyle(part('.level-switch-level[aria-pressed="false"]')).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    matches(part(".result-score-value"), { "font-size": "size-display" });
    matches(part(".result-score-total"), { color: "ink-soft", "font-size": "size-title" });
    matches(part(".best-score-value"), { color: "ink", "font-size": "size-number" });
    matches(part(".best-score-beaten"), { color: "ink-soft" });
    matches(part(".parent-menu-button"), { "background-color": "quiet", color: "ink", "border-radius": "radius-pill", "font-size": "size-label" });
    matches(part(".parent-menu-list"), { "background-color": "label", "outline-color": "outline", "border-radius": "radius-panel" });
    matches(part('.parent-menu-choice[aria-checked="true"]'), { "background-color": "quiet", color: "ink" });
    matches(part(".parent-menu-tick"), { color: "action" });
    matches(part(".parent-menu-note"), { color: "ink-soft", "font-size": "size-foot" });
    matches(part(".pairs-offer"), { "background-color": "label", color: "on-label", "border-radius": "radius-panel" });
    matches(part(".pairs-offer-question"), { "font-size": "size-title" });
    matches(part(".pairs-offer-yes"), { "background-color": "action", color: "on-action", "border-radius": "radius-pill" });
    matches(part(".pairs-offer-not-now"), { color: "ink", "border-top-color": "ink" });
    expect(getComputedStyle(part(".pairs-offer-not-now")).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    matches(part(".orientation-gate"), { "background-color": "sky-bottom", color: "ink" });
    matches(part(".orientation-gate-note"), { color: "ink-soft" });
    expect(screen.getByRole("button", { name: /SOUND/ })).toBeTruthy();
  });
}

test("shared faces follow inherited token overrides", () => {
  const { container } = render(<div style={{ "--ds-strong": "#123456", "--ds-on-strong": "#fedcba", "--ds-size-tag": "19px", "--ds-radius-tag": "11px" } as CSSProperties}>
    <LevelBadge language="en" badge="explorer" />
  </div>);
  const badge = container.querySelector(".level-badge")!;
  const style = getComputedStyle(badge);
  expect([style.backgroundColor, style.color, style.fontSize, style.borderRadius]).toEqual([
    "rgb(18, 52, 86)", "rgb(254, 220, 186)", "19px", "11px"
  ]);
});
