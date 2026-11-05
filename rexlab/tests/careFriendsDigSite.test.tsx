import { act, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
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
