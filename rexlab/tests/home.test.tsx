import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { SHIPPED_DINOSAURS, emptyProgress, englishDevice, lightDevice, manualOrientation, seededRandom } from "./support.ts";

function openHomePage() {
  render(<App dinosaurs={SHIPPED_DINOSAURS} random={seededRandom(7)} orientation={manualOrientation("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} />);
  return { user: userEvent.setup(), card: screen.getByRole("button", { name: "COMPARE" }) };
}

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

describe("the home page", () => {
  it("offers the quiz as a card with a picture of two dinosaurs", () => {
    const { card } = openHomePage();

    expect(card.textContent).toContain("COMPARE");
    expect(within(card).getByRole("img", { name: "TWO DINOSAURS" }).textContent).toBe("🦖🦕");
  });

  it("brightens the quiz card under a pointer", async () => {
    const { user, card } = openHomePage();
    expect(brightness(card)).toBe(1);

    await user.hover(card);
    expect(brightness(card)).toBeGreaterThan(1);

    await user.unhover(card);
    expect(brightness(card)).toBe(1);
  });

  it("shows the card pressed before the round opens", async () => {
    const { user, card } = openHomePage();

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  it("starts a round of 10 questions on a tap", async () => {
    const { user, card } = openHomePage();

    await user.click(card);

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
    expect(within(screen.getByRole("group", { name: "DINOSAURS" })).getAllByRole("button")).toHaveLength(2);
  });
});
