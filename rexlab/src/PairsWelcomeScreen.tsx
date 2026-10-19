import { ChartNoAxesColumnIncreasing, Copy, Footprints, House, Play, Star } from "lucide-react";
import type { CSSProperties } from "react";
import { AGE_LEVELS, type AgeLevel } from "./ageLevel.ts";
import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { usePointerState } from "./usePointerState.ts";

export type PairsWelcomeScreenProps = {
  language: Language;
  // The age level the game is played at, chosen on the level switch.
  level: AgeLevel;
  // The climb level Hatchling's next board is dealt at, and the stars
  // earned so far.
  climbLevel: number;
  stars: number;
  // The dinosaur on the hero's cards: its picture and its silhouette.
  heroPicture: string;
  onLevel: (level: AgeLevel) => void;
  onPlay: () => void;
  onHome: () => void;
};

// The place of the chosen level on the switch, which the stylesheet slides
// the chosen mark to.
const chosenAt = (level: AgeLevel) => ({ "--chosen": AGE_LEVELS.indexOf(level) }) as CSSProperties;

export function PairsWelcomeScreen({ language, level, climbLevel, stars, heroPicture, onLevel, onPlay, onHome }: PairsWelcomeScreenProps) {
  const text = TEXTS[language];
  const playPointer = usePointerState();
  // Only Hatchling climbs: at the other levels the climb level folds away,
  // kept in place so that it can unfold again.
  const climbing = level === "hatchling";
  return (
    <main className="pairs-welcome">
      <div className="stratum stratum-1" aria-hidden="true" />
      <header className="pairs-welcome-bar">
        <button type="button" className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </button>
      </header>
      <div className="pairs-welcome-body">
        {/* A face-down card, and the dinosaur's picture matched to its
            silhouette, as the game will deal them. */}
        <div className="pairs-hero" aria-hidden="true">
          <span className="pairs-hero-card pairs-hero-back">
            <span className="pair-card-back-frame">
              <Footprints size={96} />
            </span>
          </span>
          <span className="pairs-hero-card pairs-hero-silhouette">
            <Picture className="pairs-hero-picture pair-silhouette" src={heroPicture} alt="" width={800} height={600} />
          </span>
          <span className="pairs-hero-card pairs-hero-picture-card">
            <Picture className="pairs-hero-picture" src={heroPicture} alt="" width={800} height={600} />
          </span>
        </div>
        <div className="pairs-start">
          <h1 className="pairs-title">
            <span className="pairs-mark" aria-hidden="true">
              <Copy size={44} />
            </span>
            {text.pairs}
          </h1>
          <div className="pairs-chips">
            <div className="pairs-climb" data-shown={climbing || undefined} aria-hidden={!climbing || undefined}>
              <p className="pairs-chip" aria-label={text.level}>
                <ChartNoAxesColumnIncreasing size={34} aria-hidden="true" />
                {climbLevel}
              </p>
            </div>
            <p className="pairs-chip pairs-stars" aria-label={text.starsEarned}>
              <Star size={34} aria-hidden="true" />
              {stars}
            </p>
          </div>
          <div className="pairs-levels" role="group" aria-label={text.ageLevelSwitch} style={chosenAt(level)}>
            <span className="pairs-level-mark" aria-hidden="true" />
            {AGE_LEVELS.map((each) => (
              <button key={each} type="button" className="pairs-level" aria-pressed={each === level} onClick={() => onLevel(each)}>
                <span className="pairs-level-picture" aria-hidden="true">
                  {AGE_LEVEL_PICTURES[each]}
                </span>
                <span className="pairs-level-name">{text.ageLevels[each].name}</span>
              </button>
            ))}
          </div>
          <button type="button" className="card pairs-play-button" onClick={onPlay} {...playPointer}>
            <Play size={44} aria-hidden="true" />
            {text.play}
          </button>
        </div>
      </div>
    </main>
  );
}
