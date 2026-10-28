import type { CSSProperties } from "react";
import { Picture } from "./Picture.tsx";

// A crop of the complete scene in its 1200 by 900 coordinates. Keeping
// the backdrop and body in one scene gives transparent corners detail
// and makes neighboring tiles meet at every supported cut.
export type PictureCrop = { x: number; y: number; width: number; height: number };

export function PicturePuzzlePicture({ src, crop = { x: 0, y: 0, width: 1200, height: 900 } }: { src: string; crop?: PictureCrop }) {
  const style: CSSProperties = {
    aspectRatio: `${crop.width} / ${crop.height}`,
    "--scene-width": `${1200 / crop.width * 100}%`,
    "--scene-height": `${900 / crop.height * 100}%`,
    "--scene-left": `${-crop.x / crop.width * 100}%`,
    "--scene-top": `${-crop.y / crop.height * 100}%`
  } as CSSProperties;
  return (
    <span className="picture-puzzle-crop" style={style} aria-hidden="true">
      <span className="picture-puzzle-scene">
        <svg className="picture-puzzle-backdrop" viewBox="0 0 1200 900" preserveAspectRatio="none" aria-hidden="true">
          <rect width="1200" height="900" fill="#c5dfd6" />
          <path d="M0 320 Q250 120 550 370 T1200 180 V900 H0Z" fill="#94bdb0" />
          <path d="M0 650 Q400 350 800 640 T1200 560 V900 H0Z" fill="#d1bb86" />
          <path d="M-50 810 Q300 500 570 690 T1250 360" fill="none" stroke="#ead9af" strokeWidth="65" />
          {Array.from({ length: 72 }, (_, at) => {
            const x = (at % 12) * 100 + 25 + (at * 17 % 45);
            const y = Math.floor(at / 12) * 150 + 30 + (at * 23 % 80);
            return (
              <g key={at} transform={`translate(${x} ${y}) rotate(${at * 47 % 180})`}>
                <ellipse rx={10 + at % 13} ry={5 + at % 7} fill={at % 3 === 0 ? "#537f72" : "#f4e5b9"} />
                <path d={`M-20 16 Q0 ${-10 - at % 20} ${22 + at % 17} 14`} fill="none" stroke="#749587" strokeWidth="4" />
              </g>
            );
          })}
        </svg>
        <Picture src={src} alt="" className="picture-puzzle-body" width={1200} height={900} />
      </span>
    </span>
  );
}
