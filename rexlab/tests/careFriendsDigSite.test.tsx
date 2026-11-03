import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FriendsScreen, friendsColumns } from "../src/FriendsScreen.tsx";
import { manualPictures, keptNothing } from "./support.ts";
import { withManualPictures } from "./pictures.tsx";
import { computedStyleWithVariables } from "./stylesheet.ts";

const style = computedStyleWithVariables(window.getComputedStyle.bind(window));
const part = (selector: string) => document.querySelector(selector)!;
const noop = () => {};
const friends = Array.from({ length: 8 }, (_, i) => ({ id: `${i}`, name: `Friend ${i}`, picture: `friend-${i}.webp` }));
function show(columns = 5) {
  const pictures = manualPictures();
  render(<FriendsScreen language="en" friends={friends} nestPicture="nest.webp" onFriend={noop} onNewVisitor={noop} onBack={noop} onHome={noop} layoutKeeping={keptNothing} columns={() => columns} />, withManualPictures(pictures));
  return pictures;
}
afterEach(() => { delete document.documentElement.dataset.theme; delete document.documentElement.dataset.size; });

for (const theme of ["light", "dark"]) for (const shape of ["wide", "tall", "tall-narrow", "wide-short"]) {
  it(`reads the dig-site tokens in ${theme} ${shape}`, () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.size = shape;
    show();
    const matches = (selector: string, properties: Record<string, string>) => {
      for (const [property, token] of Object.entries(properties)) {
        const literal = document.createElement("span");
        literal.style.setProperty(property, style(document.documentElement).getPropertyValue(`--ds-${token}`));
        expect(style(part(selector)).getPropertyValue(property), `${selector} ${property}`).toBe(getComputedStyle(literal).getPropertyValue(property));
      }
    };
    matches('.friends', { color: 'ink' });
    matches('.friends-sand', { 'background-color': 'strata-1' });
    matches('.friends-sand-wave', { fill: 'strata-1' });
    matches('.friends-bedrock', { 'background-color': 'strata-2' });
    matches('.friend-card', { 'background-color': 'label', color: 'ink', 'border-radius': 'radius-22', 'padding-top': 'space-m', 'padding-bottom': 'space-14' });
    matches('.friend-art', { 'background-color': 'pocket-1', 'border-top-left-radius': 'radius-40', 'border-bottom-left-radius': 'radius-speech' });
    matches('.friends-mark', { 'background-color': 'pocket-1', color: 'action' });
    matches('.friend-count', { 'background-color': 'label', color: 'ink', 'font-size': 'size-number' });
    matches('.friend-count svg', { color: 'bad' });
    matches('.friends-home', { 'background-color': 'quiet', color: 'ink' });
    matches('.new-visitor-button', { 'background-color': 'action', color: 'on-action', 'border-radius': 'radius-pill' });
    matches('.friend-name', { 'font-size': shape === 'tall' ? 'size-17' : shape === 'tall-narrow' ? 'size-foot' : 'size-14' });
  });
}

it.each([2, 3, 5])("staggers only the first row of %i cards", columns => {
  show(columns);
  expect([...document.querySelectorAll<HTMLElement>('.friend-card')].map(e => e.style.getPropertyValue('--card'))).toEqual(friends.map((_, i) => `${i < columns ? i : 0}`));
  expect(part('.friend-footer').querySelector('svg')).toBeNull();
  expect(screen.getByRole('button', { name: 'Friend 0' }).textContent).toBe('FRIEND 0');
});

it("shimmers while loading and shows footprints in the pocket on failure", () => {
  const pictures = show();
  const picture = part('.friend-picture');
  expect(picture.getAttribute('data-picture')).toBe('loading');
  expect(style(picture).animation).toContain('picture-shimmer');
  expect(style(picture).getPropertyValue('--shimmer-from')).toBe(style(document.documentElement).getPropertyValue('--ds-pocket-1'));
  expect(style(picture).position).toBe('absolute');
  expect(style(part('.friend-failure')).display).toBe('none');
  act(() => pictures.fail('friend-0.webp'));
  expect(picture.getAttribute('data-picture')).toBe('failed');
  expect(style(part('.friend-failure')).display).toBe('block');
  expect(style(picture).opacity).toBe('0');
});

it.each([
  [1133, 'wide', 0, 0, 5], [1024, 'wide', 0, 0, 4], [1440, 'wide', 0, 0, 7],
  [1800, 'wide', 0, 0, 7], [1133, 'wide', 100, 100, 4],
  [744, 'tall', 0, 0, 2], [393, 'tall-narrow', 0, 0, 2], [852, 'wide-short', 0, 0, 3]
] as const)("anchors the rendered columns at %i %s with insets %i %i", (width, shape, left, right, columns) => {
  expect(friendsColumns(width, shape, left, right)).toBe(columns);
});
