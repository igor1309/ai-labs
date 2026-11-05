import { ChartNoAxesColumnIncreasing, Copy, Footprints, House, Play, Star } from "lucide-react";
import type { AgeLevel } from "./ageLevel.ts";
import { Button } from "./Button.tsx";
import { EarthEdge } from "./EarthEdge.tsx";
import { FitText } from "./FitText.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelSwitch } from "./LevelSwitch.tsx";
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
};

// The dig site: the title in the sky, the cards, the chips, the level
// switch and PLAY on the sand, and the bedrock below.
export function PairsWelcomeScreen({ language, level, climbLevel, stars, heroPicture, onLevel, onPlay, onHome }: PairsWelcomeScreenProps) {
  const text = TEXTS[language];
  // Only Hatchling climbs: at the other levels the climb level folds away,
  // kept in place so that it can unfold again.
  const climbing = level === "hatchling";
  // The cards, the title, the chips, the level switch and PLAY are the
  // parts a turn glides.
  return (
    <main className="pairs-welcome">
      <header className="pairs-welcome-sky">
        <div className="pairs-welcome-bar">
          <Button className="pairs-welcome-home" aria-label={text.home} onClick={onHome}>
            <House aria-hidden="true" />
            <span>{text.home}</span>
          </Button>
        </div>
        <h1 className="pairs-title" data-turn-part="pairs-title">
          <span className="pairs-mark" aria-hidden="true">
            <Copy />
          </span>
          <FitText className="pairs-title-word" text={text.pairs} />
        </h1>
      </header>
      <section className="pairs-welcome-sand">
        <EarthEdge className="pairs-welcome-wave" />
        <div className="pairs-welcome-body">
          {/* A face-down card, and the dinosaur's picture matched to its
              silhouette, as the game will deal them. */}
          <div className="pairs-hero" data-turn-part="pairs-cards" aria-hidden="true">
            <span className="pairs-hero-card pairs-hero-back">
              <span className="pair-card-back-frame">
                <Footprints />
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
            <div className="pairs-chips" data-turn-part="pairs-chips">
              <div className="pairs-climb" data-shown={climbing || undefined} aria-hidden={!climbing || undefined}>
                <p className="pairs-chip" aria-label={text.level}>
                  <ChartNoAxesColumnIncreasing aria-hidden="true" />
                  <span className="pairs-chip-number">{climbLevel}</span>
                </p>
              </div>
              <p className="pairs-chip pairs-stars" aria-label={text.starsEarned}>
                <Star aria-hidden="true" />
                <span className="pairs-chip-number">{stars}</span>
              </p>
            </div>
            <LevelSwitch language={language} level={level} onLevel={onLevel} part="pairs-levels" />
            <Button className="card pairs-play-button" data-turn-part="pairs-play" onClick={onPlay}>
              <Play aria-hidden="true" />
              <FitText className="pairs-play-word" text={text.play} />
            </Button>
          </div>
        </div>
      </section>
      <div className="pairs-welcome-bedrock" aria-hidden="true"><EarthEdge /></div>
    </main>
  );
}
