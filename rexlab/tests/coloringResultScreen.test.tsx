import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ColoringResultScreen } from "../src/ColoringResultScreen.tsx";
import { coloringFixture } from "./coloringFixture.ts";

it.each(["en", "ru"] as const)("shows the own composition, collection best, reward and symbol actions in %s", language => {
  const { model, dot } = coloringFixture();
  const work = model.complete(model.append(model.newWork("own"), dot));
  const painter = { width: 920, height: 620, render: vi.fn() }, choose = vi.fn();
  const view = render(<ColoringResultScreen work={work} completion={{ earned: true, completedCount: 3 }} painter={painter} language={language} busy={false} error={false} choose={choose} />);
  const canvas = view.container.querySelector("canvas");
  expect(painter.render).toHaveBeenCalledExactlyOnceWith(canvas, [dot]);
  expect(screen.getByLabelText(language === "en" ? "COLLECTION" : "КОЛЛЕКЦИЯ").textContent).toContain("3");
  expect(view.container.querySelector(".celebration")?.textContent).toBe(language === "en" ? "NEW BEST!" : "НОВЫЙ РЕКОРД!");
  for (const button of screen.getAllByRole("button")) {
    expect(button.querySelector("svg")).not.toBeNull(); expect(button.textContent).toBe(button.textContent?.toUpperCase());
    fireEvent.click(button);
  }
  expect(choose.mock.calls).toEqual([["home"], ["edit"], ["gallery"], ["new"]]);
});
it.each([1, 2, 10])("celebrates saved collection best %i only when a star was newly earned", completedCount => {
  const { model, dot } = coloringFixture(); const work = model.complete(model.append(model.newWork("own"), dot));
  const props = { work, completion: { earned: true, completedCount }, painter: { width: 920, height: 620, render: vi.fn() }, language: "en" as const, busy: false, error: false, choose: vi.fn() };
  const view = render(<ColoringResultScreen {...props} />);
  expect(view.container.querySelector(".celebration")?.textContent).toBe(completedCount === 1 ? "FIRST BEST!" : "NEW BEST!");
  view.rerender(<ColoringResultScreen {...props} completion={{ earned: false, completedCount }} />);
  expect(view.container.querySelector(".celebration, .coloring-result-earned")).toBeNull();
  expect(screen.getByText("YOUR STAR")).toBeTruthy();
  expect(screen.getByLabelText("COLLECTION").textContent).toContain(String(completedCount));
});
it("blocks departing controls and keeps its saved composition visible on an edit read error", () => {
  const { model, dot } = coloringFixture(); const work = model.complete(model.append(model.newWork("own"), dot));
  const props = { work, completion: { earned: false, completedCount: 1 }, painter: { width: 920, height: 620, render: vi.fn() }, language: "en" as const, busy: true, error: false, choose: vi.fn() };
  const view = render(<ColoringResultScreen {...props} />);
  for (const button of screen.getAllByRole("button")) { expect((button as HTMLButtonElement).disabled).toBe(true); fireEvent.click(button); }
  expect(props.choose).not.toHaveBeenCalled();
  view.rerender(<ColoringResultScreen {...props} busy={false} error />);
  expect(screen.getByRole("alert").textContent).toContain("COULDN’T OPEN");
  expect(view.container.querySelector("canvas")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "EDIT" })); expect(props.choose).toHaveBeenCalledWith("edit");
});
