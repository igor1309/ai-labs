import type { CSSProperties } from "react";

// The confetti of a celebration, as the design scatters it over the
// screen: where each piece is, as a fraction of the screen, its size,
// turn and colour.
const CONFETTI: ReadonlyArray<{ left: number; top: number; square: boolean; turn: number; colour: "amber" | "terra" | "sky" }> = [
  { left: 0.104, top: 0.1, square: true, turn: -20, colour: "amber" },
  { left: 0.229, top: 0.189, square: false, turn: 25, colour: "terra" },
  { left: 0.431, top: 0.067, square: false, turn: -35, colour: "sky" },
  { left: 0.896, top: 0.133, square: true, turn: 15, colour: "amber" },
  { left: 0.944, top: 0.333, square: false, turn: -40, colour: "terra" },
  { left: 0.819, top: 0.044, square: false, turn: -10, colour: "sky" },
  { left: 0.063, top: 0.367, square: true, turn: 35, colour: "sky" },
  { left: 0.375, top: 0.278, square: false, turn: -60, colour: "amber" },
  { left: 0.924, top: 0.578, square: false, turn: -25, colour: "amber" },
  { left: 0.486, top: 0.911, square: true, turn: 20, colour: "terra" },
  { left: 0.056, top: 0.689, square: false, turn: -15, colour: "terra" },
  { left: 0.861, top: 0.889, square: false, turn: 40, colour: "sky" },
  { left: 0.326, top: 0.044, square: true, turn: -5, colour: "terra" },
  { left: 0.646, top: 0.027, square: false, turn: 30, colour: "amber" }
];

// The glow and confetti behind a celebrated score.
export function Festivity() {
  return (
    <div className="festivity" aria-hidden="true">
      <span className="glow glow-outer" />
      <span className="glow glow-mid" />
      <span className="glow glow-inner" />
      {CONFETTI.map(({ left, top, square, turn, colour }, index) => (
        <span
          key={index}
          className={`confetti confetti-${colour}${square ? " confetti-square" : ""}`}
          // Each piece's place in the stagger of the confetti falling in.
          style={{ left: `${left * 100}%`, top: `${top * 100}%`, transform: `rotate(${turn}deg)`, ...({ "--piece": index } as CSSProperties) }}
        />
      ))}
    </div>
  );
}
