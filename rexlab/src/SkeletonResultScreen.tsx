import { ArrowRight, Bone, Landmark, Lightbulb, Star, Trophy } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { CelebrationChip, type Celebration } from "./ResultParts.tsx";
import { SkeletonBar } from "./SkeletonBar.tsx";

export type SkeletonResultScreenProps = {
  language: Language;
  // The dinosaur built, and its one short fact.
  name: string;
  fact: string;
  // The whole skeleton, and the dinosaur's body picture, which shares its
  // frame, so the body fades in exactly over its bones.
  skeleton: string;
  body: string;
  frame: { width: number; height: number };
  // The collection score: the dinosaurs with a star, out of every one.
  score: number;
  total: number;
  // The best collection score; undefined when stored progress cannot be
  // read, so there is no best to show.
  best: number | undefined;
  // The best this skeleton beat, shown before the new one; undefined when
  // it set no new best over an earlier one.
  beaten: number | undefined;
  celebration: Celebration | null;
  // This skeleton earned its dinosaur's star, which pops in; a skeleton
  // built again shows the star it already had.
  newStar: boolean;
  onBuildAnother: () => void;
  onMuseum: () => void;
  onHome: () => void;
};

export function SkeletonResultScreen({
  language,
  name,
  fact,
  skeleton,
  body,
  frame,
  score,
  total,
  best,
  beaten,
  celebration,
  newStar,
  onBuildAnother,
  onMuseum,
  onHome
}: SkeletonResultScreenProps) {
  const text = TEXTS[language];
  const shownName = name.toLocaleUpperCase(language);
  // A body picture that cannot be loaded leaves the skeleton whole, so the
  // reward never waits on it.
  const [missing, setMissing] = useState(false);
  return (
    <main className="skeleton-screen skeleton-result">
      {celebration && <Festivity />}
      <div className="stratum stratum-1" aria-hidden="true" />
      <SkeletonBar language={language} title={shownName} onHome={onHome}>
        <p className="skeleton-chip skeleton-stars" aria-label={text.starsEarned}>
          <Star size={20} aria-hidden="true" />
          {score}/{total}
        </p>
      </SkeletonBar>
      <div className="skeleton-reveal">
        <div
          className="skeleton-board skeleton-reveal-board"
          role="img"
          aria-label={shownName}
          style={{ "--frame-width": frame.width, "--frame-height": frame.height } as CSSProperties}
        >
          <img className="skeleton-reveal-bones" src={skeleton} alt="" draggable={false} data-alone={missing || undefined} />
          {!missing && <img className="skeleton-reveal-body" src={body} alt="" draggable={false} onError={() => setMissing(true)} />}
        </div>
        <section className="skeleton-reward">
          <div className="skeleton-reward-row">
            <span className="skeleton-star" role="img" aria-label={text.star} data-new={newStar || undefined}>
              <Star size={40} aria-hidden="true" />
            </span>
            {celebration && <CelebrationChip language={language} celebration={celebration} />}
          </div>
          <h2 className="skeleton-reveal-name">{shownName}</h2>
          <p className="skeleton-fact">
            <Lightbulb size={28} aria-hidden="true" />
            <span className="skeleton-fact-text">{fact}</span>
          </p>
          {best !== undefined && (
            <p className="skeleton-best" aria-label={text.bestScore}>
              <Trophy size={22} aria-hidden="true" />
              {text.best}
              {beaten !== undefined && (
                <>
                  <span className="skeleton-best-beaten">{beaten}</span>
                  <ArrowRight size={20} aria-hidden="true" />
                </>
              )}
              <span className="skeleton-best-value">
                {best}/{total}
              </span>
            </p>
          )}
          <nav className="skeleton-actions">
            <button type="button" className="skeleton-build-another" onClick={onBuildAnother}>
              <Bone size={28} aria-hidden="true" />
              {text.buildAnother}
            </button>
            <button type="button" className="home-button museum-button skeleton-museum" onClick={onMuseum}>
              <Landmark size={28} aria-hidden="true" />
              {text.museum}
            </button>
          </nav>
        </section>
      </div>
    </main>
  );
}
