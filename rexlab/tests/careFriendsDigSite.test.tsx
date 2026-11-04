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

// What each part draws with, as the dig site's token for it resolves.
function expectTokens(properties: Record<string, Record<string, string>>) {
  show();
  // jsdom recomputes the whole cascade for each style read, so the root's
  // and each part's are read once.
  const root = style(document.documentElement);
  for (const [selector, tokens] of Object.entries(properties)) {
    const drawn = style(part(selector));
    for (const [property, token] of Object.entries(tokens)) {
      const literal = document.createElement("span");
      literal.style.setProperty(property, root.getPropertyValue(`--ds-${token}`));
      expect(drawn.getPropertyValue(property), `${selector} ${property}`).toBe(getComputedStyle(literal).getPropertyValue(property));
    }
  }
}

// The colours and shapes follow the theme, the same at every window.
for (const theme of ["light", "dark"]) {
  it(`reads the dig-site tokens in ${theme}`, () => {
    document.documentElement.dataset.theme = theme;
    expectTokens({
      '.friends': { color: 'ink' },
      '.friends-sand': { 'background-color': 'strata-1' },
      '.friends-sand-wave': { fill: 'strata-1' },
      '.friends-bedrock': { 'background-color': 'strata-2' },
      '.friend-card': { 'background-color': 'label', color: 'ink', 'border-radius': 'radius-22', 'padding-top': 'space-m', 'padding-bottom': 'space-14' },
      '.friend-art': { 'background-color': 'pocket-1', 'border-top-left-radius': 'radius-40', 'border-bottom-left-radius': 'radius-speech' },
      '.friends-mark': { 'background-color': 'pocket-1', color: 'action' },
      '.friend-count': { 'background-color': 'label', color: 'ink', 'font-size': 'size-number' },
      '.friend-count svg': { color: 'bad' },
      '.friends-home': { 'background-color': 'quiet', color: 'ink' },
      '.new-visitor-button': { 'background-color': 'action', color: 'on-action', 'border-radius': 'radius-pill' }
    });
  });
}

// A name's size follows the window's shape.
for (const shape of ["wide", "tall", "tall-narrow", "wide-short"]) {
  it(`sizes a friend's name for a ${shape} window`, () => {
    document.documentElement.dataset.size = shape;
    expectTokens({ '.friend-name': { 'font-size': shape === 'tall' ? 'size-17' : shape === 'tall-narrow' ? 'size-foot' : 'size-14' } });
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
