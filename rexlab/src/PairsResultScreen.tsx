import { ArrowLeft, Hand, House, RotateCcw, Sparkles, Star, Trophy } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "./Button.tsx";
import { useGateShown } from "./OrientationGate.tsx";
import { LevelOfferDialog, type LevelOfferProps } from "./LevelOfferDialog.tsx";
import { afterResultAnimations } from "./resultAnimation.ts";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";
import { EarthEdge } from "./EarthEdge.tsx";
import { Stairs } from "./PairsIcons.tsx";
import { Picture } from "./Picture.tsx";

export type PairsCelebration = keyof Texts["celebrations"];

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
};

// Custom properties the stylesheet staggers by.
const motion = (properties: Record<`--${string}`, number>) => properties as CSSProperties;

// Three across, two for four and four for the fullest boards.
const foundColumns = (count: number) => (count === 4 ? 2 : count > 9 ? 4 : 3);

// Soft hyphens between a name's syllables, so that a narrow card breaks
// it at a hyphen and never mid-sound.
const syllabled = (name: string) => name.length < 8 ? name : name.replace(/([AEIOUYАЕЁИОУЫЭЮЯ])(?=(?:CH|PH|TH|GN|PS|ГН|ПС|[^AEIOUYАЕЁИОУЫЭЮЯ\s-])[AEIOUYАЕЁИОУЫЭЮЯ])/g, "$1\u00AD");

export function PairsResultScreen({ language, pals, tries, stars, best, beaten, celebration, levelUp, offer, onPlayAgain, onBack, onHome }: PairsResultScreenProps) {
  const gateShown = useGateShown();
  const text = TEXTS[language];
  const columns = foundColumns(pals.length);
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
      <main ref={result} inert={blocked} className="pairs-result" data-count={pals.length}>
        <div className="pairs-result-sand" aria-hidden="true"><EarthEdge className="pairs-result-wave" /></div>
        <div className="pairs-result-bedrock" aria-hidden="true"><EarthEdge /></div>
        {(celebration || levelUp) && <Festivity />}
        <div className="pairs-result-room">
          <ul className="pairs-found" aria-label={text.creatures} style={motion({ "--columns": columns, "--rows": Math.ceil(pals.length / columns) })}>
            {pals.map(({ id, name, picture, newlyFound }, index) => (
              <li key={id} className="pairs-found-card" data-turn-part={`pairs-found-${index}`} style={motion({ "--card": index })}>
                <span className="pairs-found-art">
                  <Picture className="pairs-found-picture" src={picture} alt="" width={800} height={600} />
                </span>
                <span className="pairs-found-name" data-long={name.length >= 14 || undefined} lang={language}>{syllabled(name.toLocaleUpperCase(language))}</span>
                {newlyFound && (
                  <span className="pairs-new-badge">
                    <Sparkles aria-hidden="true" />
                    <span className="pairs-new-word">{text.newlyFound}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="pairs-result-column">
          <div className="pairs-result-score">
            {levelUp && (
              <p className="pairs-level-up" data-turn-part="pairs-level-up" role="status" aria-label={text.newLevel(levelUp.level)}>
                <Stairs />
                {text.newLevel(levelUp.level)}
                {/* The next level's board, a small card for each card. */}
                <span className="pairs-next-board" aria-hidden="true" style={motion({ "--columns": levelUp.columns })}>
                  {Array.from({ length: levelUp.rows * levelUp.columns }, (_, index) => (
                    <span key={index} className="pairs-next-card" />
                  ))}
                </span>
              </p>
            )}
            <p className="pairs-result-tries" data-turn-part="pairs-tries" aria-label={text.tries}>
              <Hand className="pairs-result-hand" aria-hidden="true" />
              <span className="pairs-result-tries-value">{tries}</span>
            </p>
            <p className="pairs-result-stars" data-turn-part="pairs-stars" aria-label={text.starsEarned}>
              {/* The board's star, popped in beside the stars earned. */}
              <span className="pairs-result-star" aria-hidden="true"><Star fill="currentColor" /></span>
              <Star fill="currentColor" aria-hidden="true" />
              {stars}
            </p>
            <h1 className="pairs-result-title" data-turn-part="pairs-title">{text.wellDone}</h1>
            {(celebration || best !== undefined) && (
              <div className="pairs-best" data-celebrating={celebration || undefined}>
                {celebration && (
                  <p className="celebration" data-turn-part="pairs-celebration" role="status" aria-label={text.celebrations[celebration].label}>
                    <Trophy fill="currentColor" aria-hidden="true" />
                    <span className="celebration-text">{text.celebrations[celebration].text}</span>
                  </p>
                )}
                {best !== undefined && (
                  <p className="best-score" data-turn-part="pairs-best" aria-label={text.bestScore}>
                    {!celebration && <Trophy fill="currentColor" aria-hidden="true" />}
                    {/* The word and the best beaten are read out, not drawn. */}
                    <span className="pairs-best-hidden">{text.best}{beaten}</span>
                    <span className="best-score-value">{best}</span>
                  </p>
                )}
              </div>
            )}
          </div>
          <nav className="pairs-result-actions" data-turn-part="pairs-actions">
            <Button className="play-again-button" disabled={blocked} onClick={onPlayAgain}>
              <RotateCcw aria-hidden="true" />
              {text.playAgain}
            </Button>
            <Button className="pairs-result-back" disabled={blocked} onClick={onBack}>
              <ArrowLeft aria-hidden="true" />
              {text.back}
            </Button>
            <Button className="pairs-result-home" disabled={blocked} onClick={onHome}>
              <House aria-hidden="true" />
              {text.home}
            </Button>
          </nav>
        </div>
      </main>
      {shownOffer && blocked && (
        <LevelOfferDialog
          digSite
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
