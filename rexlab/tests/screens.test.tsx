import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addTransitionType, Profiler, startTransition } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { NEXT_QUESTION } from "../src/QuestionScreen.tsx";
import { useScreens, type TransitionFor } from "../src/screens.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuring,
  homeTile,
  lightDevice,
  manualOrientation,
  manualPictures,
  seededRandom
} from "./support.ts";

// Every transition started and every type added, seen as they are.
vi.mock("react", async (actual) => {
  const react = await actual<typeof import("react")>();
  return { ...react, addTransitionType: vi.fn(react.addTransitionType), startTransition: vi.fn(react.startTransition) };
});

const { startTransition: reactTransition } = await vi.importActual<typeof import("react")>("react");

type Shown = { kind: "one" | "two"; count: number };

const ONE: Shown = { kind: "one", count: 0 };
const TWO: Shown = { kind: "two", count: 0 };
const counted = (shown: Shown): Shown => ({ ...shown, count: shown.count + 1 });

// The screens of a module whose changes are transitions of type "slide"
// from one kind to another, and are made at once within one kind.
function screensOf(first: Shown, transitionFor: TransitionFor<Shown, string> = (from, to) => (from.kind === to.kind ? undefined : "slide")) {
  vi.mocked(addTransitionType).mockClear();
  vi.mocked(startTransition).mockClear();
  return renderHook(() => useScreens<Shown, string>(first, transitionFor));
}

describe("the screens kept by useScreens", () => {
  it("keeps the screen it is given, changed to a screen or by a function of it", () => {
    const { result } = screensOf(ONE);
    expect(result.current.screen).toBe(ONE);

    act(() => result.current.go(TWO));
    expect(result.current.screen).toBe(TWO);

    act(() => result.current.go(counted));
    expect(result.current.screen).toEqual({ kind: "two", count: 1 });

    act(() => result.current.set(ONE));
    expect(result.current.screen).toBe(ONE);
  });

  it("asks for each change's transition from the latest screen asked for, not yet rendered, with its intent", () => {
    const transitionFor = vi.fn<TransitionFor<Shown, string>>(() => undefined);
    const { result } = screensOf(ONE, transitionFor);

    act(() => {
      result.current.go(TWO, { intent: "forward" });
      result.current.go(counted);
    });

    expect(transitionFor.mock.calls).toEqual([
      [ONE, TWO, "forward"],
      [TWO, { kind: "two", count: 1 }, undefined]
    ]);
    expect(result.current.screen).toEqual({ kind: "two", count: 1 });
  });

  it("makes a change with a type a transition of that type, its companion updates inside it", () => {
    const { result } = screensOf(ONE);
    const seen: string[] = [];
    vi.mocked(startTransition).mockImplementationOnce((scope) =>
      reactTransition(() => {
        seen.push("start");
        scope();
        seen.push("end");
      })
    );
    vi.mocked(addTransitionType).mockImplementationOnce((type) => seen.push(type));

    act(() => result.current.go(TWO, { also: () => seen.push("also") }));

    expect(seen).toEqual(["start", "slide", "also", "end"]);
    expect(result.current.screen).toBe(TWO);
  });

  it("makes a change without a type at once, outside any transition, its companion updates too", () => {
    const { result } = screensOf(ONE);
    const also = vi.fn();

    act(() => result.current.go(counted, { also }));

    expect(vi.mocked(startTransition)).not.toHaveBeenCalled();
    expect(vi.mocked(addTransitionType)).not.toHaveBeenCalled();
    expect(also).toHaveBeenCalledOnce();
    expect(result.current.screen).toEqual({ kind: "one", count: 1 });
  });

  it("sets a screen without a transition of its own, the next change starting from it", () => {
    const transitionFor = vi.fn<TransitionFor<Shown, string>>(() => undefined);
    const { result } = screensOf(ONE, transitionFor);

    act(() => result.current.set(TWO));
    act(() => result.current.go(ONE));

    expect(vi.mocked(startTransition)).not.toHaveBeenCalled();
    expect(transitionFor.mock.calls).toEqual([[TWO, ONE, undefined]]);
  });

  // A late change keeps to the screen it came from by checking it is still
  // on the very screen it was given.
  it("gives a function of the screen the same screen as is rendered", () => {
    const { result } = screensOf(ONE);
    act(() => result.current.go(counted));
    const rendered = result.current.screen;

    act(() => result.current.go((current) => (current === rendered ? TWO : current)));

    expect(result.current.screen).toBe(TWO);
    expect(vi.mocked(addTransitionType).mock.calls).toEqual([["slide"]]);
  });
});

const cards = () => within(screen.getByRole("group", { name: "DINOSAURS" })).getAllByRole("button");

describe("the screen changes of the app", () => {
  // In a browser a question's view transition commits after it starts,
  // so a tap can land on the question still shown: here NEXT's change and
  // a tap on an old card land in one act, before React commits.
  it("shows the same screens and transition when an old card is tapped while NEXT is pending", async () => {
    const pictures = manualPictures();
    const shown: Array<string | null> = [];
    render(
      <Profiler id="app" onRender={() => shown.push(screen.queryByLabelText("PROGRESS")?.textContent ?? null)}>
        <App {...featuring()} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(15)} orientation={manualOrientation("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...pictures} />
      </Profiler>
    );
    const user = userEvent.setup();
    await user.click(homeTile("COMPARE"));
    act(() => pictures.loading().forEach(pictures.finish));
    const [first, second] = cards();
    if (!first || !second) throw new Error("Expected two dinosaur cards");
    await user.click(first);
    await user.click(screen.getByRole("button", { name: "NEXT" }));
    vi.mocked(addTransitionType).mockClear();
    vi.mocked(startTransition).mockClear();
    shown.length = 0;

    act(() => {
      pictures.loading().forEach(pictures.finish);
      fireEvent.click(second);
    });

    expect(shown).toEqual(["1/10", "2/10"]);
    expect(vi.mocked(addTransitionType).mock.calls).toEqual([[NEXT_QUESTION]]);
    expect(vi.mocked(startTransition)).toHaveBeenCalledOnce();
    // React applies the old card's answer after NEXT, as it queued them:
    // question 2 shows answered, with neither of its cards chosen.
    expect(cards().map((card) => [card.getAttribute("aria-disabled"), card.getAttribute("data-chosen")])).toEqual([
      ["true", null],
      ["true", null]
    ]);
  });
});
