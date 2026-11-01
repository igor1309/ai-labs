import { SAND } from "./sandWritingCanvas.ts";

// The marks' own size, kept at any tile size, as the canvas keeps its tip.
export const MARKS_WIDTH = 160;
export const MARKS_HEIGHT = 100;

// A 2, an A and a circle, written in the sand the way the canvas draws
// them: a groove over a light lip pushed out below and to the right.
const MARKS = [
  "M20 38 Q28 22 42 26 Q55 32 44 50 L22 74 H52",
  "M68 74 L82 26 L96 74 M74 58 H90",
  "M108 50 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0"
];

// Every copy defines the same grain, so one id serves them all.
const GRAIN = "sand-writing-grain";

// A picture, not a surface: the sand keeps the canvas's colours in both
// themes, as DIG's sand picture does.
export function SandWritingPicture() {
  return (
    <span className="sand-writing-tile-art" aria-hidden="true">
      <svg width="100%" height="100%">
        <defs>
          <pattern id={GRAIN} width={11} height={9} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={0.7} fill={SAND.lip} />
            <circle cx={6} cy={5} r={0.7} fill={SAND.groove} opacity={0.4} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={SAND.bed} />
        <rect width="100%" height="100%" fill={`url(#${GRAIN})`} />
        <svg
          className="sand-writing-tile-marks"
          x="50%"
          y="50%"
          width={MARKS_WIDTH}
          height={MARKS_HEIGHT}
          viewBox={`0 0 ${MARKS_WIDTH} ${MARKS_HEIGHT}`}
          overflow="visible"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g transform={`translate(${-MARKS_WIDTH / 2} ${-MARKS_HEIGHT / 2})`}>
            <g stroke={SAND.lip} strokeWidth={6.4} transform="translate(0.7 0.7)">
              {MARKS.map((mark) => <path key={mark} d={mark} />)}
            </g>
            <g stroke={SAND.groove} strokeWidth={5}>
              {MARKS.map((mark) => <path key={mark} d={mark} />)}
            </g>
          </g>
        </svg>
      </svg>
    </span>
  );
}
