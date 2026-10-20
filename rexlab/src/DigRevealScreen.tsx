import { House, RotateCcw, Star, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button.tsx";
import { DigBar } from "./DigBar.tsx";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelOfferDialog, type LevelOfferProps } from "./LevelOfferDialog.tsx";
import { LevelBadge } from "./LevelBadge.tsx";
import { LevelSwitch, type LevelSwitchProps } from "./LevelSwitch.tsx";
import { useGateShown } from "./OrientationGate.tsx";
import { Picture, PictureImage, type PictureLook } from "./Picture.tsx";
import type { StartTimer } from "./ownedTimers.ts";
import { afterResultAnimations } from "./resultAnimation.ts";
import { CelebrationChip, type Celebration } from "./ResultParts.tsx";

// The reveal's arrival, then the star's flight, or their reduced-motion
// fades. Every mounted reveal waits as long, a star flying or not.
export const STAR_LANDS: Record<"motion" | "reduced", number> = { motion: 640, reduced: 320 };

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
  // The dinosaur was dug up for the first time: its star flies onto the
  // card, with NEW!.
  newStar: boolean;
  celebration: Celebration | null;
  // The dinosaur has its 🦴 badge, named at the first pick.
  badge: boolean;
  // The star has landed on the card, and the reveal takes taps.
  landed: boolean;
  startTimer: StartTimer;
  landingWait: number;
  onLanded: (landed: boolean) => void;
  onDigAgain: () => void;
  onHome: () => void;
};

// The round's result: the dinosaur the gust has uncovered, whole, its
// name large on one line, and the "DUG UP" card, then the level switch
// above DIG AGAIN and HOME. Until the star has landed nothing on it takes
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
  startTimer,
  landingWait,
  onLanded,
  level,
  onLevel,
  onDigAgain,
  onHome
}: DigRevealScreenProps) {
  const gateShown = useGateShown();
  const text = TEXTS[language];
  const result = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"waiting" | "shown" | "leaving" | "gone">("waiting");
  const [shownOffer, setShownOffer] = useState<LevelOfferProps | null>(null);
  const blocked = phase === "shown" || phase === "leaving";
  const latestOffer = useRef(offer);
  latestOffer.current = offer;
  const hasOffer = Boolean(offer);
  // The reward must be visible for its full landing wait before it takes
  // taps. Covering it cancels that wait, including a queued callback.
  useEffect(() => {
    if (gateShown) return;
    let active = true;
    const stop = startTimer(landingWait, () => {
      if (active) onLanded(true);
    });
    return () => {
      active = false;
      stop();
      onLanded(false);
    };
  }, [startTimer, landingWait, onLanded, gateShown]);
  useEffect(() => {
    if (gateShown || !landed || phase !== "waiting" || !hasOffer || !result.current) return;
    const rewards = [...result.current.querySelectorAll(".dig-card-star, .celebration")];
    return afterResultAnimations(rewards, startTimer, () => {
      if (!latestOffer.current) return;
      setShownOffer(latestOffer.current);
      setPhase("shown");
    });
  }, [landed, phase, startTimer, hasOffer, gateShown]);
  useEffect(() => {
    if (!gateShown && phase === "gone") result.current?.querySelector<HTMLButtonElement>(".play-again-button")?.focus();
  }, [phase, gateShown]);
  return (
    <>
      <main ref={result} inert={blocked} className="dig-screen dig-reveal-screen">
        {celebration && <Festivity />}
        <div className="stratum result-stratum" aria-hidden="true" />
        <DigBar language={language} />
        <div className="dig-reveal">
          <span className="dig-reveal-art">
            {pictureLook ? <PictureImage look={pictureLook} className="dig-reveal-picture" src={picture} alt="" width={800} height={600} /> : <Picture className="dig-reveal-picture" src={picture} alt="" width={800} height={600} />}
          </span>
          <section className="dig-reward">
            <h2 className="dig-reveal-name">{name.toLocaleUpperCase(language)}</h2>
            {dugUp !== undefined && (
              <section className="dig-card" aria-label={text.dugUp} data-new={newStar || undefined}>
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
            {celebration && <CelebrationChip language={language} celebration={celebration} />}
            <div className="dig-reveal-ways" inert={!landed || blocked}>
              <LevelSwitch language={language} level={level} onLevel={onLevel} disabled={!landed || blocked} />
              <nav className="result-actions">
                <Button className="play-again-button" disabled={!landed || blocked} onClick={onDigAgain}>
                  <RotateCcw size={28} aria-hidden="true" />
                  {text.digAgain}
                </Button>
                <Button className="home-button" disabled={!landed || blocked} onClick={onHome}>
                  <House size={28} aria-hidden="true" />
                  {text.home}
                </Button>
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
