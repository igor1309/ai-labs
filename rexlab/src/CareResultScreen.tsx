import { Footprints, Heart, HeartHandshake, House } from "lucide-react";
import { Button } from "./Button.tsx";
import "./careResult.css";
import { DigGround } from "./DigBar.tsx";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
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
  // The visitor, each reward and the actions are the parts a turn glides.
  return (
    <main className="care-result" data-celebrating={celebration ? "" : undefined}>
      <DigGround />
      {celebration && <Festivity />}
      <div className="care-result-art">
        <Picture className="result-hero care-result-hero" part="result-hero" src={visitor.picture} alt="" width={800} height={600} />
      </div>
      <div className="result-content">
        <ScoreCount language={language} score={score} total={total} part="result-score" />
        {/* A child who cannot read the numbers yet counts the hearts. */}
        <p className="result-hearts" data-turn-part="result-hearts" role="img" aria-label={text.heartsOf(score, total)}>
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={index < score ? "result-heart result-heart-won" : "result-heart"} style={motion({ "--heart": index })} aria-hidden="true">
              <Heart size={52} fill={index < score ? "currentColor" : "none"} />
            </span>
          ))}
        </p>
        <h1 className="result-title" data-turn-part="result-title">{newFriend ? text.newFriend : text.wellDone}</h1>
        <div className="care-result-chips" data-turn-part="care-result-chips">
          <p className="friend-chip" aria-label={text.friend}>
            <Heart size={22} fill="currentColor" aria-hidden="true" />
            {visitor.name.toLocaleUpperCase(language)}
          </p>
          {best !== undefined && (celebration
            ? <div className="care-record" data-turn-part="result-best" aria-label={text.bestScore}>
              <CelebrationChip language={language} celebration={celebration} part="result-celebration" />
              {beaten !== undefined && <span className="best-score-beaten">{beaten}</span>}
              <span className="best-score-value">{best}</span>
            </div>
            : <BestScore language={language} best={best} beaten={beaten} part="result-best" symbol />)}
        </div>
      </div>
      <nav className="result-actions" data-turn-part="result-actions">
        <Button className="care-result-action care-result-new" onClick={onNewVisitor}>
          <Footprints size={28} aria-hidden="true" />
          <span className="care-result-words">{text.newVisitor}</span>
        </Button>
        <Button className="care-result-action care-result-friends" onClick={onFriends}>
          <HeartHandshake size={28} aria-hidden="true" />
          <span className="care-result-words">{text.friends}</span>
        </Button>
        <Button className="care-result-action care-result-home" onClick={onHome}>
          <House size={28} aria-hidden="true" />
          <span className="care-result-words">{text.home}</span>
        </Button>
      </nav>
    </main>
  );
}
