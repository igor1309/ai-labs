import { DoorOpen, Footprints, Heart, HeartHandshake, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import { DigGround } from "./DigBar.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { SkeletonBar } from "./SkeletonBar.tsx";
import "./careWelcome.css";

// The friends' faces on the FRIENDS card: two rows of three.
const FACES = 6;

export type CareWelcomeScreenProps = {
  language: Language;
  // The best score of a finished visit, undefined while there is none to
  // show, out of `total`.
  best: number | undefined;
  total: number;
  // The dinosaur waiting at the door on the NEW VISITOR card.
  visitorPicture: string;
  // How many friends the child has, and the pictures of the first ones.
  friendCount: number;
  friendPictures: readonly string[];
  onNewVisitor: () => void;
  onFriends: () => void;
  onHome: () => void;
};

// CARE's welcome on the dig site (design/dig-site.pen, CARE · welcome): the
// bar in the sky, and on the sand NEW VISITOR, the visitor at the door in
// its pocket, beside FRIENDS, the friends' faces over their count.
export function CareWelcomeScreen({ language, best, total, visitorPicture, friendCount, friendPictures, onNewVisitor, onFriends, onHome }: CareWelcomeScreenProps) {
  const text = TEXTS[language];
  const faces = Array.from({ length: FACES }, (_, at) => friendPictures[at]);
  return (
    <main className="skeleton-dig care-welcome">
      <DigGround />
      <SkeletonBar language={language} title={text.care} Mark={Heart} onHome={onHome}>
        {best !== undefined && (
          <p className="skeleton-chip care-best" aria-label={text.bestScore}>
            <Trophy size={22} fill="currentColor" aria-hidden="true" />
            {best}<span className="care-best-of">/{total}</span>
          </p>
        )}
      </SkeletonBar>
      <div className="care-choices">
        <Button className="care-card new-visitor-card" aria-label={text.newVisitor} data-turn-part="care-new-visitor" onClick={onNewVisitor}>
          <span className="new-visitor-art" aria-hidden="true">
            <Picture className="new-visitor-picture" src={visitorPicture} alt="" width={800} height={600} />
            <span className="knock-bubble">
              <DoorOpen />
            </span>
          </span>
          <span className="care-pill new-visitor-pill" aria-hidden="true">
            <Footprints />
            <span className="care-pill-words">{text.newVisitor}</span>
          </span>
        </Button>
        <Button className="care-card friends-card" aria-label={text.friends} data-turn-part="care-friends" onClick={onFriends}>
          <span className="care-faces" aria-hidden="true">
            {faces.map((picture, at) => (
              <span key={at} className="care-face" data-empty={picture === undefined || undefined} style={{ "--face": at } as CSSProperties}>
                {picture === undefined ? <Heart /> : <Picture className="care-face-picture" src={picture} alt="" width={800} height={600} />}
              </span>
            ))}
          </span>
          <span className="care-friends-row" aria-hidden="true">
            <span className="care-pill friends-pill">
              <HeartHandshake />
              <span className="care-pill-words">{text.friends}</span>
            </span>
            <span className="care-friend-count">
              <Heart fill="currentColor" />
              {friendCount}
            </span>
          </span>
        </Button>
      </div>
    </main>
  );
}
