import { ArrowRight, Heart, House, RotateCcw, Sparkles, Star } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Button } from "./Button.tsx";
import { DigGround } from "./DigBar.tsx";
import "./labyrinthResult.css";
import { Festivity } from "./Festivity.tsx";
import { LevelSwitch, type LevelSwitchProps } from "./LevelSwitch.tsx";
import { Picture } from "./Picture.tsx";
import { BestScore, CelebrationChip, motion, type Celebration } from "./ResultParts.tsx";
import { TEXTS } from "./language/texts.ts";

export type LabyrinthResultScreenProps = Pick<LevelSwitchProps, "language" | "level" | "onLevel"> & {
  ref?: Ref<HTMLElement>;
  // The board's existing body picture, shared by baby and parent.
  picture: string;
  // The saved total after this round; undefined when progress cannot be read.
  totalStars: number | undefined;
  // The played level's best and the earlier best this round beat.
  best: number | undefined;
  beaten: number | undefined;
  celebration: Celebration | null;
  // The caller owns the offer's timing and answers; it blocks the result
  // controls for as long as the offer is rendered, including its exit.
  levelOffer?: ReactNode;
  onPlayAgain: () => void;
  onHome: () => void;
};

export function LabyrinthResultScreen({ ref, language, level, onLevel, picture, totalStars, best, beaten, celebration, levelOffer, onPlayAgain, onHome }: LabyrinthResultScreenProps) {
  const text = TEXTS[language];
  const words = text.labyrinthResult;
  const blocked = Boolean(levelOffer);
  return (
    <>
      <main ref={ref} className="labyrinth-result-screen" inert={blocked}>
        <DigGround />
        {celebration && <Festivity />}
        <div className="labyrinth-result">
          <div className="labyrinth-family" data-turn-part="result-hero">
            <Picture className="labyrinth-reunion-parent" src={picture} alt={text.labyrinthBoard.parent} width={800} height={600} />
            <Picture className="labyrinth-reunion-baby" src={picture} alt={text.labyrinthBoard.baby} width={800} height={600} />
            <Heart className="labyrinth-reunion-heart" fill="currentColor" aria-hidden="true" />
            <Sparkles className="labyrinth-reunion-glints" aria-hidden="true" />
          </div>
          <div className="labyrinth-reward-column">
            <h1 className="labyrinth-reunion-title" data-turn-part="result-title">
              <span className="labyrinth-house-badge" aria-hidden="true"><House /></span>{words.title}
            </h1>
            <p className="result-stars labyrinth-reunion-stars" data-turn-part="result-stars" role="img" aria-label={text.stars(3, 3)}>
              {[0, 1, 2].map((index) => (
                <span key={index} className="star star-won" style={motion({ "--star": index })} aria-hidden="true"><Star size={64} fill="currentColor" /></span>
              ))}
            </p>
            <div className="labyrinth-score" data-turn-part="result-score">
              <p className="labyrinth-reward"><Star className="labyrinth-chip-symbol" fill="currentColor" aria-hidden="true" />{words.earned}{totalStars !== undefined && <> · {words.total(totalStars)}</>}</p>
              {best !== undefined && (celebration
                ? <div className="labyrinth-record" data-turn-part="result-best">
                  <CelebrationChip language={language} celebration={celebration} part="result-celebration" />
                  <span className="labyrinth-record-number" aria-hidden="true">{beaten !== undefined && <>{beaten}<ArrowRight aria-hidden="true" /></>}{best}</span>
                </div>
                : <div className="labyrinth-record" data-turn-part="result-best"><BestScore language={language} best={best} beaten={beaten} total={3} symbol /></div>)}
            </div>
            <div className="labyrinth-reunion-levels">
              <LevelSwitch language={language} level={level} onLevel={onLevel} disabled={blocked} part="result-levels" />
            </div>
            <nav className="labyrinth-reunion-actions" data-turn-part="result-actions">
              <Button disabled={blocked} onClick={onPlayAgain}><RotateCcw size={28} aria-hidden="true" />{words.again}</Button>
              <Button disabled={blocked} onClick={onHome}><House size={28} aria-hidden="true" />{text.home}</Button>
            </nav>
          </div>
        </div>
      </main>
      {levelOffer}
    </>
  );
}
