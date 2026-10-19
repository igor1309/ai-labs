import { House, RotateCcw, Star, Trophy } from "lucide-react";
import { DigBar } from "./DigBar.tsx";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelBadge } from "./LevelBadge.tsx";
import { LevelSwitch, type LevelSwitchProps } from "./LevelSwitch.tsx";
import { Picture } from "./Picture.tsx";
import { CelebrationChip, type Celebration } from "./ResultParts.tsx";

export type DigRevealScreenProps = Omit<LevelSwitchProps, "language"> & {
  language: Language;
  // The dinosaur dug up: its name and its body picture, whole.
  name: string;
  picture: string;
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
  dugUp,
  total,
  newStar,
  celebration,
  badge,
  landed,
  level,
  onLevel,
  onDigAgain,
  onHome
}: DigRevealScreenProps) {
  const text = TEXTS[language];
  return (
    <main className="dig-screen dig-reveal-screen">
      {celebration && <Festivity />}
      <div className="stratum result-stratum" aria-hidden="true" />
      <DigBar language={language} />
      <div className="dig-reveal">
        <span className="dig-reveal-art">
          <Picture className="dig-reveal-picture" src={picture} alt="" width={800} height={600} />
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
          <div className="dig-reveal-ways" inert={!landed}>
            <LevelSwitch language={language} level={level} onLevel={onLevel} />
            <nav className="result-actions">
              <button type="button" className="play-again-button" disabled={!landed} onClick={onDigAgain}>
                <RotateCcw size={28} aria-hidden="true" />
                {text.digAgain}
              </button>
              <button type="button" className="home-button" disabled={!landed} onClick={onHome}>
                <House size={28} aria-hidden="true" />
                {text.home}
              </button>
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
}
