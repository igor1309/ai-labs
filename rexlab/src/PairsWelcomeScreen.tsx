import { ChartNoAxesColumnIncreasing, Copy, Footprints, House, Play, Star } from "lucide-react";
import type { CSSProperties } from "react";
import type { AgeLevel } from "./ageLevel.ts";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelSwitch } from "./LevelSwitch.tsx";
import type { WelcomeType } from "./pairsWelcomeLayout.ts";
import { Picture } from "./Picture.tsx";

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
  // The title's and the level names' type upright, one for the window;
  // landscape sizes them itself.
  type?: WelcomeType;
};

// The upright type, as the custom properties the stylesheet reads.
const typeStyle = (type: WelcomeType | undefined) =>
  (type ? { "--pairs-title-size": `${type.title}px`, "--level-name-size": `${type.levelName}px` } : {}) as CSSProperties;

export function PairsWelcomeScreen({ language, level, climbLevel, stars, heroPicture, onLevel, onPlay, onHome, type }: PairsWelcomeScreenProps) {
  const text = TEXTS[language];
  // Only Hatchling climbs: at the other levels the climb level folds away,
  // kept in place so that it can unfold again.
  const climbing = level === "hatchling";
  // The cards, the title, the chips, the level switch and PLAY are the
  // parts a turn glides.
  return (
    <main className="pairs-welcome" style={typeStyle(type)}>
      <div className="stratum stratum-1" aria-hidden="true" />
      <header className="pairs-welcome-bar">
        <Button className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          <span className="narrow-hidden">{text.home}</span>
        </Button>
      </header>
      <div className="pairs-welcome-body">
        {/* A face-down card, and the dinosaur's picture matched to its
            silhouette, as the game will deal them. */}
        <div className="pairs-hero" data-turn-part="pairs-cards" aria-hidden="true">
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
          <h1 className="pairs-title" data-turn-part="pairs-title">
            <span className="pairs-mark" aria-hidden="true">
              <Copy size={44} />
            </span>
            {text.pairs}
          </h1>
          <div className="pairs-chips" data-turn-part="pairs-chips">
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
          <LevelSwitch language={language} level={level} onLevel={onLevel} part="pairs-levels" />
          <Button className="card pairs-play-button" data-turn-part="pairs-play" onClick={onPlay}>
            <Play size={44} aria-hidden="true" />
            {text.play}
          </Button>
        </div>
      </div>
    </main>
  );
}
