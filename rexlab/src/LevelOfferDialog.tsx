import { Check, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { AgeLevel } from "./ageLevel.ts";
import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { useGateShown } from "./OrientationGate.tsx";
import type { StartTimer } from "./ownedTimers.ts";
import { afterResultAnimations } from "./resultAnimation.ts";

export type LevelOfferProps = {
  level: AgeLevel;
  onYes: () => void;
  onNotNow: () => void;
  onShown: () => void;
  startTimer: StartTimer;
};

export function LevelOfferDialog({ language, offer, leaving, onShown, onAnswer, onGone }: {
  language: Language;
  offer: LevelOfferProps;
  leaving: boolean;
  onShown: () => void;
  onAnswer: (answer: "yes" | "not-now") => void;
  onGone: () => void;
}) {
  const gateShown = useGateShown();
  const text = TEXTS[language];
  const title = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  const callbacks = useRef({ onShown, onGone });
  callbacks.current = { onShown, onGone };
  useEffect(() => {
    if (gateShown) return;
    if (!shown.current) {
      shown.current = true;
      callbacks.current.onShown();
    }
    overlay.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [gateShown]);
  useEffect(() => {
    if (gateShown || !leaving || !overlay.current) return;
    return afterResultAnimations([overlay.current], offer.startTimer, () => {
      callbacks.current.onGone();
    });
  }, [leaving, offer.startTimer, gateShown]);
  return (
    <div ref={overlay} className="pairs-offer-scrim" data-leaving={leaving || undefined}>
      <section className="pairs-offer" role="dialog" aria-modal="true" aria-labelledby={title}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = overlay.current?.querySelectorAll<HTMLButtonElement>("button");
          const first = buttons?.[0];
          const last = buttons?.[1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <span className="pairs-offer-picture" aria-hidden="true">{AGE_LEVEL_PICTURES[offer.level]}</span>
        <h2 id={title} className="pairs-offer-question">{text.levelOffer.question(text.ageLevels[offer.level].name)}</h2>
        <div className="pairs-offer-answers">
          <Button className="pairs-offer-yes" disabled={leaving} onClick={() => onAnswer("yes")}>
            <Check size={30} aria-hidden="true" />{text.levelOffer.yes}
          </Button>
          <Button className="pairs-offer-not-now" disabled={leaving} onClick={() => onAnswer("not-now")}>
            <X size={30} aria-hidden="true" />{text.levelOffer.notNow}
          </Button>
        </div>
      </section>
    </div>
  );
}
