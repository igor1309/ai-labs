import { ArrowRight, Footprints, Heart, HeartHandshake, House, Star, Trophy, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";

export type CareCelebration = keyof Texts["celebrations"];

const CELEBRATION_SYMBOLS: Record<CareCelebration, LucideIcon> = { "first-best": Star, "new-best": Trophy };

export type CareResultScreenProps = {
  language: Language;
  // The dinosaur cared for: its name and the URL of its picture.
  visitor: { name: string; picture: string };
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to show.
  best: number | undefined;
  // The best score this visit beat, shown before the new one; undefined
  // when the visit set no new best over an earlier one.
  beaten: number | undefined;
  celebration: CareCelebration | null;
  // The visit made the visitor a friend for the first time.
  newFriend: boolean;
  onNewVisitor: () => void;
  onFriends: () => void;
  onHome: () => void;
};

// Custom properties the stylesheet animates by: the score the count-up
// ends on, and the place of a heart in its stagger.
const motion = (properties: Record<`--${string}`, number>) => properties as CSSProperties;

export function CareResultScreen({ language, visitor, score, total, best, beaten, celebration, newFriend, onNewVisitor, onFriends, onHome }: CareResultScreenProps) {
  const text = TEXTS[language];
  const CelebrationSymbol = celebration && CELEBRATION_SYMBOLS[celebration];
  return (
    <main className="result care-result">
      {celebration && <Festivity />}
      <div className="stratum result-stratum" aria-hidden="true" />
      <img className="result-hero care-result-hero" src={visitor.picture} alt="" draggable={false} />
      <div className="result-content">
        {celebration && CelebrationSymbol && (
          <p className="celebration" role="status" aria-label={text.celebrations[celebration].label}>
            <CelebrationSymbol size={30} aria-hidden="true" />
            <span className="celebration-text">{text.celebrations[celebration].text}</span>
          </p>
        )}
        <p className="result-score" aria-label={text.score}>
          <span className="result-score-value" style={motion({ "--score": score })}>
            <span className="result-score-digits">{score}</span>
          </span>
          <span className="result-score-total">/{total}</span>
        </p>
        {/* A child who cannot read the numbers yet counts the hearts. */}
        <p className="result-hearts" role="img" aria-label={text.heartsOf(score, total)}>
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={index < score ? "result-heart result-heart-won" : "result-heart"} style={motion({ "--heart": index })} aria-hidden="true">
              <Heart size={52} fill="currentColor" />
            </span>
          ))}
        </p>
        <h1 className="result-title">{newFriend ? text.newFriend : text.wellDone}</h1>
        <div className="care-result-chips">
          <p className="friend-chip" aria-label={text.friend}>
            <Heart size={22} fill="currentColor" aria-hidden="true" />
            {visitor.name.toLocaleUpperCase(language)}
          </p>
          {best !== undefined && (
            <p className="best-score" aria-label={text.bestScore}>
              {text.best}
              {beaten !== undefined && (
                <>
                  <span className="best-score-beaten">{beaten}</span>
                  <ArrowRight size={20} aria-hidden="true" />
                </>
              )}
              <span className="best-score-value">
                {best}/{total}
              </span>
            </p>
          )}
        </div>
        <nav className="result-actions">
          <button type="button" className="play-again-button" onClick={onNewVisitor}>
            <Footprints size={28} aria-hidden="true" />
            {text.newVisitor}
          </button>
          <button type="button" className="home-button" onClick={onFriends}>
            <HeartHandshake size={28} aria-hidden="true" />
            {text.friends}
          </button>
          <button type="button" className="home-button" onClick={onHome}>
            <House size={28} aria-hidden="true" />
            {text.home}
          </button>
        </nav>
      </div>
    </main>
  );
}
