import { Bone } from "lucide-react";
import type { CSSProperties } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { SkeletonBar } from "./SkeletonBar.tsx";

export type ShownPiece = "skull" | "spine" | "legs" | "tail";

// Where a piece goes on the outline, as fractions of the outline's width
// and height, and whether it is fitted there.
export type SkeletonSlotView = {
  piece: ShownPiece;
  picture: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fitted: boolean;
};

export type SkeletonPuzzleScreenProps = {
  language: Language;
  // The dinosaur being built.
  name: string;
  // The whole skeleton, drawn faint as the outline the pieces fit on, and
  // its frame's size.
  outline: string;
  frame: { width: number; height: number };
  // Every piece's slot, in the tray's order: a piece not yet fitted waits
  // in its spot in the tray, and a fitted one leaves its spot empty, so
  // the other pieces never move.
  slots: readonly SkeletonSlotView[];
  onMuseum: () => void;
  onHome: () => void;
};

const percent = (fraction: number) => `${fraction * 100}%`;

export function SkeletonPuzzleScreen({ language, name, outline, frame, slots, onMuseum, onHome }: SkeletonPuzzleScreenProps) {
  const text = TEXTS[language];
  const fitted = slots.filter((slot) => slot.fitted).length;
  return (
    <main className="skeleton-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <SkeletonBar language={language} title={name.toLocaleUpperCase(language)} onMuseum={onMuseum} onHome={onHome}>
        <p className="skeleton-chip" aria-label={text.fitted}>
          <Bone size={20} aria-hidden="true" />
          {fitted}/{slots.length}
        </p>
      </SkeletonBar>
      <div className="skeleton-puzzle">
        <div
          className="skeleton-board"
          role="group"
          aria-label={text.skeleton}
          style={{ "--frame-width": frame.width, "--frame-height": frame.height } as CSSProperties}
        >
          <img className="skeleton-outline" src={outline} alt="" draggable={false} />
          {slots.map((slot) => (
            <span
              key={slot.piece}
              className="skeleton-slot"
              data-piece={slot.piece}
              data-state={slot.fitted ? "fitted" : "empty"}
              style={{ left: percent(slot.left), top: percent(slot.top), width: percent(slot.width), height: percent(slot.height) }}
            >
              {slot.fitted && <img className="skeleton-fitted" src={slot.picture} alt={text.pieces[slot.piece]} draggable={false} />}
            </span>
          ))}
        </div>
        <div className="skeleton-tray" role="group" aria-label={text.bones}>
          {slots.map((slot, index) => (
            <span key={slot.piece} className="skeleton-tray-spot" data-piece={slot.piece} style={{ "--piece": index } as CSSProperties}>
              {!slot.fitted && <img className="skeleton-piece" src={slot.picture} alt={text.pieces[slot.piece]} draggable={false} />}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
