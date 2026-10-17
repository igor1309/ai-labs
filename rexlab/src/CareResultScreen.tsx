import { Footprints, Heart, HeartHandshake, House } from "lucide-react";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { BestScore, CelebrationChip, motion, ScoreCount, type Celebration } from "./ResultParts.tsx";

export type CareCelebration = Celebration;

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

export function CareResultScreen({ language, visitor, score, total, best, beaten, celebration, newFriend, onNewVisitor, onFriends, onHome }: CareResultScreenProps) {
  const text = TEXTS[language];
  return (
    <main className="result care-result">
      {celebration && <Festivity />}
      <div className="stratum result-stratum" aria-hidden="true" />
      <img className="result-hero care-result-hero" src={visitor.picture} alt="" draggable={false} />
      <div className="result-content">
        {celebration && <CelebrationChip language={language} celebration={celebration} />}
        <ScoreCount language={language} score={score} total={total} />
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
          {best !== undefined && <BestScore language={language} best={best} beaten={beaten} total={total} />}
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
