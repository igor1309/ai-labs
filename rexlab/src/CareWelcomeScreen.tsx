import { DoorOpen, Footprints, Heart, HeartHandshake, House, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";

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

export function CareWelcomeScreen({ language, best, total, visitorPicture, friendCount, friendPictures, onNewVisitor, onFriends, onHome }: CareWelcomeScreenProps) {
  const text = TEXTS[language];
  const faces = Array.from({ length: FACES }, (_, at) => friendPictures[at]);
  return (
    <main className="care-welcome">
      <header className="care-bar">
        <Button className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </Button>
        <h1 className="care-title">
          <span className="care-mark" aria-hidden="true">
            <Heart size={28} />
          </span>
          {text.care}
        </h1>
        {best !== undefined && (
          <p className="care-best" aria-label={text.bestScore}>
            <Trophy size={20} aria-hidden="true" />
            {best}/{total}
          </p>
        )}
      </header>
      <div className="care-choices">
        <Button className="card new-visitor-card" aria-label={text.newVisitor} onClick={onNewVisitor}>
          <span className="new-visitor-art" aria-hidden="true">
            <span className="new-visitor-glow" />
            <Picture className="new-visitor-picture" src={visitorPicture} alt="" width={800} height={600} />
            <span className="knock-bubble">
              <DoorOpen size={56} />
            </span>
          </span>
          <span className="new-visitor-footer">
            <span className="new-visitor-symbol" aria-hidden="true">
              <Footprints size={34} />
            </span>
            <span className="new-visitor-title">{text.newVisitor}</span>
          </span>
        </Button>
        <Button className="card friends-card" aria-label={text.friends} onClick={onFriends}>
          <span className="friend-faces" aria-hidden="true">
            {faces.map((picture, at) => (
              <span key={at} className="friend-face" style={{ "--face": at } as CSSProperties}>
                {picture !== undefined && <Picture className="friend-face-picture" src={picture} alt="" width={800} height={600} />}
              </span>
            ))}
          </span>
          <span className="friends-row">
            <span className="friends-symbol" aria-hidden="true">
              <HeartHandshake size={30} />
            </span>
            <span className="friends-title">{text.friends}</span>
            <span className="friend-count">
              <Heart size={20} aria-hidden="true" />
              {friendCount}
            </span>
          </span>
        </Button>
      </div>
    </main>
  );
}
