import { ArrowLeft, ArrowRight, ChartNoAxesColumnIncreasing, Hand, House, RotateCcw, Sparkles, Star, Trophy, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "./Button.tsx";
import { useGateShown } from "./OrientationGate.tsx";
import { LevelOfferDialog, type LevelOfferProps } from "./LevelOfferDialog.tsx";
import { afterResultAnimations } from "./resultAnimation.ts";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";
import { pairsResultType } from "./pairsResultLayout.ts";
import { Picture } from "./Picture.tsx";

export type PairsCelebration = keyof Texts["celebrations"];

const CELEBRATION_SYMBOLS: Record<PairsCelebration, LucideIcon> = { "first-best": Star, "new-best": Trophy };

export type FoundPal = { id: string; name: string; picture: string; newlyFound: boolean };

export type PairsResultScreenProps = {
  language: Language;
  // The board's dinosaurs, in the order dealt.
  pals: readonly FoundPal[];
  tries: number;
  // Every star earned, this board's among them.
  stars: number;
  // The level's fewest tries; undefined when stored progress cannot be
  // read, so there is no best to show.
  best: number | undefined;
  // The best this board beat, shown before the new one; undefined when
  // the board set no new best over an earlier one.
  beaten: number | undefined;
  celebration: PairsCelebration | null;
  // The level the board moved the child up to, with the shape of its
  // board, or null.
  levelUp: { level: number; rows: number; columns: number } | null;
  // The caller decides whether the next level is due. No offer is the
  // ordinary result; each result mount can show its offer only once.
  offer?: LevelOfferProps | null;
  onPlayAgain: () => void;
  // Back to the game's welcome screen.
  onBack: () => void;
  onHome: () => void;
  // The width the result stands in upright, one for the window; landscape
  // sizes it itself.
  width?: number;
};

// Custom properties the stylesheet staggers by.
const motion = (properties: Record<`--${string}`, number>) => properties as CSSProperties;

// The tallest a card may stand upright and the actions' type, as the
// custom properties the stylesheet reads.
function typeStyle(width: number | undefined, count: number): CSSProperties {
  if (width === undefined) return {};
  const type = pairsResultType(width, count);
  return { "--card-maximum": `${type.cardMaximum}px`, "--action-size": `${type.action}px` } as CSSProperties;
}

export function PairsResultScreen({ language, pals, tries, stars, best, beaten, celebration, levelUp, offer, onPlayAgain, onBack, onHome, width }: PairsResultScreenProps) {
  const gateShown = useGateShown();
  const text = TEXTS[language];
  const CelebrationSymbol = celebration && CELEBRATION_SYMBOLS[celebration];
  const result = useRef<HTMLElement>(null);
  const [offerPhase, setOfferPhase] = useState<"waiting" | "shown" | "leaving" | "gone">("waiting");
  const [shownOffer, setShownOffer] = useState<PairsResultScreenProps["offer"]>(null);
  const blocked = offerPhase === "shown" || offerPhase === "leaving";
  const latestOffer = useRef(offer);
  latestOffer.current = offer;
  const startTimer = offer?.startTimer;
  useEffect(() => {
    if (gateShown || offerPhase !== "waiting" || !startTimer || !result.current) return;
    const rewards = [...result.current.querySelectorAll(".pairs-result-star, .celebration, .pairs-level-up")];
    return afterResultAnimations(rewards, startTimer, () => {
      if (!latestOffer.current) return;
      setShownOffer(latestOffer.current);
      setOfferPhase("shown");
    });
  }, [startTimer, offerPhase, gateShown]);
  useEffect(() => {
    if (!gateShown && offerPhase === "gone") result.current?.querySelector<HTMLButtonElement>(".play-again-button")?.focus();
  }, [offerPhase, gateShown]);
  // Each dinosaur, each reward and the actions are the parts a turn
  // glides.
  return (
    <>
      <main ref={result} inert={blocked} className="result pairs-result" data-large={pals.length > 6 || undefined} style={typeStyle(width, pals.length)}>
        {(celebration || levelUp) && <Festivity />}
        <div className="stratum result-stratum" aria-hidden="true" />
        <ul className="pairs-found" aria-label={text.creatures} data-count={pals.length} style={motion({ "--found-rows": Math.ceil(pals.length / 3) })}>
          {pals.map(({ id, name, picture, newlyFound }, index) => (
            <li key={id} className="pairs-found-card" data-turn-part={`pairs-found-${index}`} style={motion({ "--card": index })}>
              <span className="pairs-found-art">
                <Picture className="pairs-found-picture" src={picture} alt="" width={800} height={600} />
              </span>
              <span className="pairs-found-name">{name.toLocaleUpperCase(language)}</span>
              {newlyFound && (
                <span className="pairs-new-badge">
                  <Sparkles size={20} aria-hidden="true" />
                  {text.newlyFound}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="result-content">
          {(celebration || levelUp) && (
            <div className="pairs-badges">
              {celebration && CelebrationSymbol && (
                <p className="celebration" data-turn-part="pairs-celebration" role="status" aria-label={text.celebrations[celebration].label}>
                  <CelebrationSymbol size={30} aria-hidden="true" />
                  <span className="celebration-text">{text.celebrations[celebration].text}</span>
                </p>
              )}
              {levelUp && (
                <p className="pairs-level-up" data-turn-part="pairs-level-up" role="status" aria-label={text.newLevel(levelUp.level)}>
                  <ChartNoAxesColumnIncreasing size={34} aria-hidden="true" />
                  {levelUp.level}
                  {/* The next level's board, a small card for each card. */}
                  <span className="pairs-next-board" aria-hidden="true" style={motion({ "--columns": levelUp.columns })}>
                    {Array.from({ length: levelUp.rows * levelUp.columns }, (_, index) => (
                      <span key={index} className="pairs-next-card" />
                    ))}
                  </span>
                </p>
              )}
            </div>
          )}
          <p className="pairs-result-tries" data-turn-part="pairs-tries" aria-label={text.tries}>
            <span className="pairs-result-tries-value">{tries}</span>
            <Hand className="pairs-result-hand" size={96} aria-hidden="true" />
          </p>
          {/* The board's star flies into the stars earned. */}
          <p className="pairs-result-stars" data-turn-part="pairs-stars" aria-label={text.starsEarned}>
            <span className="pairs-result-star" aria-hidden="true">
              ★
            </span>
            {stars}
          </p>
          <h1 className="result-title" data-turn-part="pairs-title">{text.wellDone}</h1>
          {best !== undefined && (
            <p className="best-score" data-turn-part="pairs-best" aria-label={text.bestScore}>
              <Trophy size={22} aria-hidden="true" />
              {text.best}
              {beaten !== undefined && (
                <>
                  <span className="best-score-beaten">{beaten}</span>
                  <ArrowRight size={20} aria-hidden="true" />
                </>
              )}
              <span className="best-score-value">{best}</span>
            </p>
          )}
          <nav className="result-actions" data-turn-part="pairs-actions">
            <Button className="play-again-button" disabled={blocked} onClick={onPlayAgain}>
              <RotateCcw size={28} aria-hidden="true" />
              {text.playAgain}
            </Button>
            <Button className="home-button" disabled={blocked} onClick={onBack}>
              <ArrowLeft size={28} aria-hidden="true" />
              {text.back}
            </Button>
            <Button className="home-button" disabled={blocked} onClick={onHome}>
              <House size={28} aria-hidden="true" />
              {text.home}
            </Button>
          </nav>
        </div>
      </main>
      {shownOffer && blocked && (
        <LevelOfferDialog
          language={language}
          offer={shownOffer}
          leaving={offerPhase === "leaving"}
          onShown={shownOffer.onShown}
          onAnswer={(answer) => {
            setOfferPhase("leaving");
            if (answer === "yes") shownOffer.onYes();
            else shownOffer.onNotNow();
          }}
          onGone={() => setOfferPhase("gone")}
        />
      )}
    </>
  );
}
