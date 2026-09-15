import type { ObservedSession, SessionSource } from "../src/sessions.js";

export function sourceOf(...sessions: ObservedSession[]): SessionSource {
  return () => sessions;
}

export function changingSource(...sessions: ObservedSession[]): {
  read: SessionSource;
  readCount: () => number;
  replaceWith: (...next: ObservedSession[]) => void;
} {
  let current = sessions;
  let reads = 0;

  return {
    read: () => {
      reads += 1;

      return current;
    },
    readCount: () => reads,
    replaceWith: (...next) => {
      current = next;
    },
  };
}
