import { ArrowRight, Bone, Landmark, Lightbulb, Star, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture, PictureImage, usePicture } from "./Picture.tsx";
import { LevelBadge, type ShownBadge } from "./LevelBadge.tsx";
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
  // The level badge this skeleton earned, built without help's last step,
  // shown by its name.
  badge: ShownBadge | undefined;
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
  badge,
  onBuildAnother,
  onMuseum,
  onHome
}: SkeletonResultScreenProps) {
  const text = TEXTS[language];
  const shownName = name.toLocaleUpperCase(language);
  // The whole skeleton stands in for the body picture until it loads, so
  // the reward never waits on it: the body fades in over its bones once
  // loaded, and one that fails leaves the skeleton whole.
  const bodyLook = usePicture(body);
  const bodyShown = bodyLook === "appearing" || bodyLook === "shown";
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
          <span className="skeleton-reveal-bones" data-alone={!bodyShown || undefined}>
            <Picture className="skeleton-reveal-bones-picture" src={skeleton} alt="" />
          </span>
          {bodyShown && <PictureImage look={bodyLook} className="skeleton-reveal-body" src={body} alt="" />}
        </div>
        <section className="skeleton-reward">
          <div className="skeleton-reward-row">
            <span className="skeleton-star" role="img" aria-label={text.star} data-new={newStar || undefined}>
              <Star size={40} aria-hidden="true" />
            </span>
            {celebration && <CelebrationChip language={language} celebration={celebration} />}
          </div>
          {badge && (
            <p className="skeleton-badge-earned">
              <LevelBadge language={language} badge={badge} />
              <span aria-hidden="true">{text.badges[badge]}</span>
            </p>
          )}
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
