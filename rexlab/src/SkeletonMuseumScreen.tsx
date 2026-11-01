import { Bone, Hammer, Landmark, RotateCcw, Star, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelBadge, type ShownBadge } from "./LevelBadge.tsx";
import { Picture } from "./Picture.tsx";
import { SkeletonBar } from "./SkeletonBar.tsx";

// A stand shows its skeleton once built; one still to build shows the
// skeleton's silhouette, and so does one knocked down to be built again,
// with the star it keeps. A stand shows its skeleton's level badges.
export type ShownStand = "built" | "rebuilding" | "empty";

export type SkeletonStandView = { id: string; name: string; skeleton: string; state: ShownStand; badges: readonly ShownBadge[] };

export type SkeletonMuseumScreenProps = {
  language: Language;
  // One stand for each dinosaur, in the order the hall shows them.
  stands: readonly SkeletonStandView[];
  // The collection score: the dinosaurs with a star, out of every one.
  score: number;
  total: number;
  // The best collection score; undefined until a skeleton is finished, or
  // when stored progress cannot be read.
  best: number | undefined;
  // A stand's skeleton built for the first time, or again once knocked
  // down, and one knocked down from its stand to be built again.
  onBuild: (id: string) => void;
  onRebuild: (id: string) => void;
  onBuildAnother: () => void;
  onHome: () => void;
  onJawShelf?: (() => void) | undefined;
};

export function SkeletonMuseumScreen({ language, stands, score, total, best, onBuild, onRebuild, onBuildAnother, onHome, onJawShelf }: SkeletonMuseumScreenProps) {
  const text = TEXTS[language];
  return (
    <main className="skeleton-screen skeleton-museum-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <SkeletonBar language={language} title={text.museum} Mark={Landmark} onHome={onHome}>
        <Button className="home-button skeleton-bar-button" onClick={onBuildAnother}>
          <Bone size={24} aria-hidden="true" />
          <span className="upright-hidden">{text.buildAnother}</span>
        </Button>
        <p className="skeleton-chip skeleton-stars" aria-label={text.starsEarned}>
          <Star size={20} aria-hidden="true" />
          {score}/{total}
        </p>
        {best !== undefined && (
          <p className="skeleton-chip" aria-label={text.bestScore}>
            <Trophy size={20} aria-hidden="true" />
            {best}/{total}
          </p>
        )}
      </SkeletonBar>
      <div className="skeleton-hall" role="group" aria-label={text.stands}>
        {stands.map((stand, index) => (
          <StandCard key={stand.id} language={language} stand={stand} index={index} onBuild={onBuild} onRebuild={onRebuild} />
        ))}
        {onJawShelf && <section className="skeleton-stand jaw-museum-stand" aria-label={text.jawShelf} data-turn-part="jaw-shelf" style={{ "--stand": stands.length } as CSSProperties}>
          <div className="skeleton-stand-top"><h2 className="skeleton-stand-name">{text.jawShelf}</h2></div>
          <div className="skeleton-exhibit"><span className="jaw-museum-tooth" aria-hidden="true">🦷</span></div>
          <Button className="skeleton-stand-button" onClick={onJawShelf}><Landmark size={24} aria-hidden="true" />{text.jawShelf}</Button>
        </section>}
      </div>
    </main>
  );
}

function StandCard({
  language,
  stand,
  index,
  onBuild,
  onRebuild
}: {
  language: Language;
  stand: SkeletonStandView;
  index: number;
  onBuild: (id: string) => void;
  onRebuild: (id: string) => void;
}) {
  const text = TEXTS[language];
  const name = stand.name.toLocaleUpperCase(language);
  const built = stand.state === "built";
  return (
    <section className="skeleton-stand" aria-label={name} data-turn-part={`skeleton-stand-${stand.id}`} data-state={stand.state} style={{ "--stand": index } as CSSProperties}>
      <div className="skeleton-stand-top">
        <h2 className="skeleton-stand-name">{name}</h2>
        {stand.state !== "empty" && (
          <span className="skeleton-stand-star" role="img" aria-label={text.star}>
            <Star size={22} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="skeleton-exhibit">
        {stand.badges.length > 0 && (
          <span className="skeleton-stand-badges">
            {stand.badges.map((badge) => (
              <LevelBadge key={badge} language={language} badge={badge} />
            ))}
          </span>
        )}
        <Picture className={built ? "skeleton-exhibit-picture" : "skeleton-exhibit-picture skeleton-silhouette"} src={stand.skeleton} alt="" />
      </div>
      {built ? (
        <Button className="skeleton-stand-button" onClick={() => onRebuild(stand.id)}>
          <RotateCcw size={24} aria-hidden="true" />
          {text.rebuild}
        </Button>
      ) : (
        <Button className="skeleton-stand-button" onClick={() => onBuild(stand.id)}>
          {stand.state === "empty" ? <Bone size={24} aria-hidden="true" /> : <Hammer size={24} aria-hidden="true" />}
          {stand.state === "empty" ? text.build : text.keepBuilding}
        </Button>
      )}
    </section>
  );
}
