import { useSyncExternalStore, type ReactNode } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

export type Orientation = {
  isPortrait(): boolean;
  subscribe(onChange: () => void): () => void;
};

// The game is laid out for landscape. In portrait the gate shows only a
// picture asking to turn the iPad; the game's state is kept by its owner,
// so turning back resumes where the child was.
export function OrientationGate({
  orientation,
  language,
  children
}: {
  orientation: Orientation;
  language: Language;
  children: ReactNode;
}) {
  const portrait = useSyncExternalStore(orientation.subscribe, orientation.isPortrait);
  if (!portrait) {
    return children;
  }
  return (
    <main className="turn-sideways">
      <span className="turn-sideways-picture" role="img" aria-label={TEXTS[language].turnSideways}>
        📱↻
      </span>
    </main>
  );
}
