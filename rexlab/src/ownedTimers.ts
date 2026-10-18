// Calls `fire` after `ms` milliseconds, unless the returned stop is
// called first.
export type StartTimer = (ms: number, fire: () => void) => () => void;

// The timers of one visit, board or puzzle: each is started through
// `start`, and `stopAll` stops those still running as the child leaves
// it. Each timer's own stop still stops it alone, so a change inside the
// occurrence can rearm it.
export type OwnedTimers = { start: StartTimer; stopAll(): void };

// A callback the timer delivers once stopped is passed on all the same:
// the code that started it checks that it still applies.
export function ownedTimers(startTimer: StartTimer): OwnedTimers {
  const running = new Set<() => void>();
  return {
    start: (ms, fire) => {
      let stopTimer = () => {};
      const stop = () => {
        if (running.delete(stop)) stopTimer();
      };
      running.add(stop);
      stopTimer = startTimer(ms, () => {
        running.delete(stop);
        fire();
      });
      return stop;
    },
    stopAll: () => {
      for (const stop of [...running]) stop();
    }
  };
}
