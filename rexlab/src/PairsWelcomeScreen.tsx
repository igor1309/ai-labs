import { ChartNoAxesColumnIncreasing, Copy, Footprints, House, Play, Star } from "lucide-react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { usePointerState } from "./usePointerState.ts";

export type PairsWelcomeScreenProps = {
  language: Language;
  // The level the next board is dealt at, and the stars earned so far.
  level: number;
  stars: number;
  // The dinosaur on the hero's cards: its picture and its silhouette.
  heroPicture: string;
  onPlay: () => void;
  onHome: () => void;
};

export function PairsWelcomeScreen({ language, level, stars, heroPicture, onPlay, onHome }: PairsWelcomeScreenProps) {
  const text = TEXTS[language];
  const playPointer = usePointerState();
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
            <p className="pairs-chip" aria-label={text.level}>
              <ChartNoAxesColumnIncreasing size={34} aria-hidden="true" />
              {level}
            </p>
            <p className="pairs-chip pairs-stars" aria-label={text.starsEarned}>
              <Star size={34} aria-hidden="true" />
              {stars}
            </p>
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
