import type { SessionChanges } from "../src/follow.js";

// Stands in for the filesystem watcher: the test decides when the sources are
// worth re-reading.
export function changeSignal(): { subscribe: SessionChanges; fire: () => void } {
  const listeners: (() => void)[] = [];

  return {
    subscribe: (onChange) => {
      listeners.push(onChange);
    },
    fire: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
