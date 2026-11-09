import { act, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { openHomeApp } from "./skeletonsApp.tsx";
import { featuredCard, manualViewport, tilesRow } from "./support.ts";

// Home keeps its choice and menus while the ground reflows with the window.
it.each(["wide", "tall", "tall-narrow", "wide-short"] as const)("keeps today's game and an open menu when resizing to %s", async (size) => {
  const viewport = manualViewport("landscape");
  const { user } = openHomeApp({ viewport, portraitLayouts: { home: ["tall", "tall-narrow"] } });
  const game = featuredCard().dataset.game;
  const tiles = [...tilesRow().querySelectorAll("button")].map(tile => tile.getAttribute("aria-label"));
  await user.click(screen.getByRole("button", { name: "Theme" }));

  act(() => viewport.resize(size, size.startsWith("tall")));

  expect(featuredCard().dataset.game).toBe(game);
  expect(screen.getByRole("menu", { name: "Theme" })).toBeTruthy();
  expect([...tilesRow().querySelectorAll("button")].map(tile => tile.getAttribute("aria-label"))).toEqual(tiles);
});
