import { House, RotateCcw, Star, Trophy } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DigBar } from "./DigBar.tsx";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelOfferDialog, type LevelOfferProps } from "./LevelOfferDialog.tsx";
import { LevelBadge } from "./LevelBadge.tsx";
import { LevelSwitch, type LevelSwitchProps } from "./LevelSwitch.tsx";
import { Picture, PictureImage, type PictureLook } from "./Picture.tsx";
import type { StartTimer } from "./ownedTimers.ts";
import { afterResultAnimations } from "./resultAnimation.ts";
import { CelebrationChip, motion, type Celebration } from "./ResultParts.tsx";

export const REVEAL_GLIDE = { motion: 320, reduced: 160 };
export const REVEAL_STAGGER = { motion: 60, reduced: 0 };
// The last of six reward parts finishes here. Controls arrive at the
// same time even when a repeated find has fewer rewards to show.
export const STAR_LANDS = {
  motion: REVEAL_GLIDE.motion + 5 * REVEAL_STAGGER.motion,
  reduced: REVEAL_GLIDE.reduced
};

export type DigRevealScreenProps = Omit<LevelSwitchProps, "language"> & {
  language: Language;
  // The dinosaur dug up: its name and its body picture, whole.
  name: string;
  picture: string;
  pictureLook?: PictureLook;
  offer?: LevelOfferProps | null;
  // The dinosaurs dug up, this one among them, out of every one;
  // undefined when stored progress cannot be read, so there is no count
  // and no card to show.
  dugUp: number | undefined;
  total: number;
  // The dinosaur was dug up for the first time: its star is already on
  // the card, with NEW!, after its flight on the board.
  newStar: boolean;
  celebration: Celebration | null;
  // The dinosaur has its 🦴 badge, named at the first pick.
  badge: boolean;
  // The last item has arrived, and the reveal takes taps.
  landed: boolean;
  reducedMotion?: boolean;
  startTimer: StartTimer;
  landingWait: number;
  onLanded: (landed: boolean) => void;
  onDigAgain: () => void;
  onHome: () => void;
};

// The round's result: the dinosaur the gust has uncovered, whole, its
// name large on one line, and the "DUG UP" card, then the level switch
// above DIG AGAIN and HOME. Until the last item arrives nothing on it takes
// a tap, so a finger still dabbing at the sand presses nothing.
export function DigRevealScreen({
  language,
  name,
  picture,
  pictureLook,
  offer,
  dugUp,
  total,
  newStar,
  celebration,
  badge,
  landed,
  reducedMotion = false,
  startTimer,
  landingWait,
  onLanded,
  level,
  onLevel,
  onDigAgain,
  onHome
}: DigRevealScreenProps) {
  const text = TEXTS[language];
  const timing = reducedMotion ? "reduced" : "motion";
  // Missing rewards leave time before the name, keeping visible parts
  // consecutive and the controls' arrival independent of saved progress.
  let part = 2 - Number(dugUp !== undefined) - Number(Boolean(celebration));
  const arrival = () => motion({ "--reveal-part": part++ });
  const result = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"waiting" | "shown" | "leaving" | "gone">("waiting");
  const [shownOffer, setShownOffer] = useState<LevelOfferProps | null>(null);
  const blocked = phase === "shown" || phase === "leaving";
  const latestOffer = useRef(offer);
  latestOffer.current = offer;
  const hasOffer = Boolean(offer);
  // Rotation remounts the reveal and restarts its animation, so only this
  // mounted reveal can say when its displayed parts have arrived.
  useEffect(() => {
    let active = true;
    const stop = startTimer(landingWait, () => {
      if (active) onLanded(true);
    });
    return () => {
      active = false;
      stop();
      onLanded(false);
    };
  }, [startTimer, landingWait, onLanded]);
  useEffect(() => {
    if (!landed || phase !== "waiting" || !hasOffer || !result.current) return;
    const rewards = [...result.current.querySelectorAll(".dig-card-star, .celebration")];
    return afterResultAnimations(rewards, startTimer, () => {
      if (!latestOffer.current) return;
      setShownOffer(latestOffer.current);
      setPhase("shown");
    });
  }, [landed, phase, startTimer, hasOffer]);
  useEffect(() => {
    if (phase === "gone") result.current?.querySelector<HTMLButtonElement>(".play-again-button")?.focus();
  }, [phase]);
  return (
    <>
      <main ref={result} inert={blocked} className="dig-screen dig-reveal-screen" data-motion={!reducedMotion || undefined}
        style={{ "--dig-reveal-duration": `${REVEAL_GLIDE[timing]}ms`, "--dig-reveal-stagger": `${REVEAL_STAGGER[timing]}ms` } as CSSProperties}>
        {celebration && <Festivity />}
        <div className="stratum result-stratum" aria-hidden="true" />
        <DigBar language={language} />
        <div className="dig-reveal">
          <span className="dig-reveal-art">
            {pictureLook ? <PictureImage look={pictureLook} className="dig-reveal-picture" src={picture} alt="" width={800} height={600} /> : <Picture className="dig-reveal-picture" src={picture} alt="" width={800} height={600} />}
          </span>
          <section className="dig-reward">
            <h2 className="dig-reveal-name" style={arrival()}>{name.toLocaleUpperCase(language)}</h2>
            {dugUp !== undefined && (
              <section className="dig-card" aria-label={text.dugUp} data-new={newStar || undefined} style={arrival()}>
                <span className="dig-card-star" role="img" aria-label={text.star}>
                  <Star size={36} aria-hidden="true" />
                </span>
                <span className="dig-card-words" aria-hidden="true">
                  {text.dugUp}
                </span>
                <span className="dig-card-count">
                  {dugUp}/{total}
                </span>
                {newStar && <span className="dig-card-new">{text.dugUpNew}</span>}
                {dugUp === total && (
                  <span className="dig-card-trophy" role="img" aria-label={text.allDugUp}>
                    <Trophy size={30} aria-hidden="true" />
                  </span>
                )}
                {badge && <LevelBadge language={language} badge="paleontologist" />}
              </section>
            )}
            {celebration && <div className="dig-reveal-celebration" style={arrival()}><CelebrationChip language={language} celebration={celebration} /></div>}
            <div className="dig-reveal-ways" inert={!landed || blocked}>
              <div className="dig-reveal-level" style={arrival()}><LevelSwitch language={language} level={level} onLevel={onLevel} disabled={!landed || blocked} /></div>
              <nav className="result-actions">
                <button type="button" className="play-again-button" style={arrival()} disabled={!landed || blocked} onClick={onDigAgain}>
                  <RotateCcw size={28} aria-hidden="true" />
                  {text.digAgain}
                </button>
                <button type="button" className="home-button" style={arrival()} disabled={!landed || blocked} onClick={onHome}>
                  <House size={28} aria-hidden="true" />
                  {text.home}
                </button>
              </nav>
            </div>
          </section>
        </div>
      </main>
      {shownOffer && blocked && <LevelOfferDialog language={language} offer={shownOffer} leaving={phase === "leaving"}
        onShown={shownOffer.onShown}
        onAnswer={(answer) => {
          setPhase("leaving");
          if (answer === "yes") shownOffer.onYes();
          else shownOffer.onNotNow();
        }}
        onGone={() => setPhase("gone")} />}
    </>
  );
}
