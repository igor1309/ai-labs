import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addTransitionType, Profiler, startTransition } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { NEXT_DINOSAUR, PREVIOUS_DINOSAUR } from "../src/DinosaurPage.tsx";
import { NEXT_QUESTION } from "../src/QuestionScreen.tsx";
import { SCREEN_CHANGE, useScreens, type TransitionFor } from "../src/screens.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuring,
  gameDoor,
  lightDevice,
  loadedPictures,
  unsetAgeLevel,
  manualViewport,
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

  // A second start, landing while the first one's transition is pending,
  // keeps the screen asked for: React must not apply it, at once, to the
  // screen still rendered, which would show a screen nobody asked for.
  it("enqueues no change that keeps the screen asked for, while a transition is pending", () => {
    vi.mocked(startTransition).mockClear();
    const rendered: Shown[] = [];
    const { result } = renderHook(() => {
      const screens = useScreens<Shown, string>(ONE, (from, to) => (from.kind === to.kind ? undefined : "slide"));
      rendered.push(screens.screen);
      return screens;
    });
    const also = vi.fn();
    const start = (current: Shown): Shown => (current.kind === "two" ? current : { kind: "two", count: rendered.length });

    act(() => {
      result.current.go(start, { also });
      result.current.go(start, { also });
    });

    expect(new Set(rendered.filter((shown) => shown !== ONE)).size).toBe(1);
    expect(result.current.screen.kind).toBe("two");
    expect(also).toHaveBeenCalledOnce();
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
        <App {...featuring()} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(15)} portraitLayouts={new Set()} viewport={manualViewport("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} {...pictures} />
      </Profiler>
    );
    const user = userEvent.setup();
    await user.click(gameDoor("COMPARE"));
    act(() => pictures.loading().forEach(pictures.finish));
    const [first, second] = cards();
    if (!first || !second) throw new Error("Expected two dinosaur cards");
    await user.click(first);
    const next = screen.getByRole("button", { name: "NEXT" });
    vi.mocked(addTransitionType).mockClear();
    vi.mocked(startTransition).mockClear();
    shown.length = 0;

    act(() => {
      fireEvent.click(next);
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

// The app on the home page, its pictures ready at once, with the
// catalogue it is given.
function openApp(catalogue = SHIPPED_CATALOGUE) {
  render(
    <App {...featuring()} dinosaurs={SHIPPED_DINOSAURS} catalogue={catalogue} bodyPicture={fakeBodyPicture} random={seededRandom(15)} portraitLayouts={new Set()} viewport={manualViewport("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} {...loadedPictures()} />
  );
  return userEvent.setup();
}

// The transition types added since the last call.
function typesAdded() {
  const types = vi.mocked(addTransitionType).mock.calls.map(([type]) => type);
  vi.mocked(addTransitionType).mockClear();
  return types;
}

describe("the screen changes of the games and pages", () => {
  // HOME keeps the board left unfinished, so the next board is shown over
  // it: still the plain screen change, as the first one was.
  it("shows SORT reopened after HOME as the plain screen change, as the first time", async () => {
    const user = openApp();
    typesAdded();

    await user.click(gameDoor("SORT"));
    expect(typesAdded()).toContain(SCREEN_CHANGE);

    await user.click(screen.getByRole("button", { name: "HOME" }));
    typesAdded();
    await user.click(gameDoor("SORT"));

    expect(typesAdded()).toEqual([SCREEN_CHANGE]);
  });

  it.each([
    ["a catalogue, from a page in the middle", 42, 20],
    ["a catalogue, from its last page, going round", 42, 41],
    ["a catalogue of two", 2, 0],
    ["a catalogue of two, from its last page", 2, 1],
    ["a catalogue of one", 1, 0]
  ])("slides a dinosaur's page in each arrow's direction, on %s", async (_, size, at) => {
    const catalogue = SHIPPED_CATALOGUE.slice(0, size);
    const shown = catalogue[at];
    if (!shown) throw new Error("Expected a dinosaur");
    const user = openApp(catalogue);
    await user.click(gameDoor("ALL DINOSAURS"));
    await user.click(screen.getByRole("button", { name: shown.name.en }));
    typesAdded();

    await user.click(screen.getByRole("button", { name: "NEXT" }));
    expect(typesAdded()).toEqual([NEXT_DINOSAUR]);

    await user.click(screen.getByRole("button", { name: "PREVIOUS" }));
    expect(typesAdded()).toEqual([PREVIOUS_DINOSAUR]);
  });
});
