import { describe, expect, it } from "vitest";
import { ownedTimers, type StartTimer } from "../src/ownedTimers.ts";

// A timer that fires only when the test calls `fire`, and counts how
// often each one started was stopped.
function timerSpy() {
  const started: Array<{ ms: number; fire: () => void; stops: number }> = [];
  const startTimer: StartTimer = (ms, fire) => {
    const timer = { ms, fire, stops: 0 };
    started.push(timer);
    return () => {
      timer.stops++;
    };
  };
  return { startTimer, started, stops: () => started.map(({ stops }) => stops) };
}

describe("owned timers", () => {
  it("start through the timer they are given, each firing its own callback", () => {
    const spy = timerSpy();
    const timers = ownedTimers(spy.startTimer);
    const fired: string[] = [];

    timers.start(800, () => fired.push("reaction"));
    timers.start(1280, () => fired.push("departure"));
    spy.started[1]?.fire();
    spy.started[0]?.fire();

    expect([spy.started.map(({ ms }) => ms), fired]).toEqual([
      [800, 1280],
      ["departure", "reaction"]
    ]);
  });

  it("stop, as their occurrence ends, each one still running, once, and none stopped or fired already", () => {
    const spy = timerSpy();
    const timers = ownedTimers(spy.startTimer);
    const stopOwn = timers.start(1000, () => {});
    timers.start(1000, () => {});
    timers.start(1000, () => {});
    stopOwn();
    spy.started[1]?.fire();

    timers.stopAll();
    timers.stopAll();
    stopOwn();

    expect(spy.stops()).toEqual([1, 0, 1]);
  });

  it("stop one alone by its own stop, leaving the others running", () => {
    const spy = timerSpy();
    const timers = ownedTimers(spy.startTimer);
    const stopFirst = timers.start(1000, () => {});
    timers.start(1000, () => {});

    stopFirst();

    expect(spy.stops()).toEqual([1, 0]);
  });

  it("pass on a callback their timer delivers after it was stopped, for the code that started it to check", () => {
    const spy = timerSpy();
    const timers = ownedTimers(spy.startTimer);
    let fired = 0;
    timers.start(1000, () => fired++);

    timers.stopAll();
    spy.started[0]?.fire();

    expect([spy.stops(), fired]).toEqual([[1], 1]);
  });
});
