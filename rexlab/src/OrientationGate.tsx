import { AppWindow, MoveHorizontal, RectangleHorizontal, RectangleVertical, RotateCw } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

const GateShown = createContext(false);

// Window-level drag listeners also need to stop when their screen is inert.
export const useGateShown = () => useContext(GateShown);

// Both layers stay mounted so the gate can fade in either direction and
// the screen keeps its state. Inert blocks touch and keyboard behind it.
export function OrientationGate({ shown, screenUpright, language, children }: {
  shown: boolean;
  screenUpright: boolean;
  language: Language;
  children: ReactNode;
}) {
  const text = TEXTS[language];
  const instruction = screenUpright ? text.turnSideways : text.makeWindowWider;
  return (
    <>
      <div className="gated-screen" inert={shown} aria-hidden={shown || undefined}>
        <GateShown value={shown}>{children}</GateShown>
      </div>
      <div className="orientation-gate" data-shown={shown || undefined} inert={!shown} aria-hidden={!shown}>
        <div className="orientation-gate-picture" role="img" aria-label={instruction}>
          <span className="orientation-gate-symbols" aria-hidden="true">
            {screenUpright ? <><RectangleVertical /><RotateCw /><RectangleHorizontal /></> : <><AppWindow /><MoveHorizontal /></>}
          </span>
          <span aria-hidden="true">{instruction}</span>
        </div>
        <p className="orientation-gate-note">{text.portraitLayoutComing}</p>
      </div>
    </>
  );
}
