import { DoorOpen, Footprints, Heart, HeartHandshake, House, Trophy } from "lucide-react";
import type { CSSProperties } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { usePointerState } from "./usePointerState.ts";

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
  const visitorPointer = usePointerState();
  const friendsPointer = usePointerState();
  const faces = Array.from({ length: FACES }, (_, at) => friendPictures[at]);
  return (
    <main className="care-welcome">
      <header className="care-bar">
        <button type="button" className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </button>
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
        <button type="button" className="card new-visitor-card" aria-label={text.newVisitor} onClick={onNewVisitor} {...visitorPointer}>
          <span className="new-visitor-art" aria-hidden="true">
            <span className="new-visitor-glow" />
            <img className="new-visitor-picture" src={visitorPicture} alt="" draggable={false} />
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
        </button>
        <button type="button" className="card friends-card" aria-label={text.friends} onClick={onFriends} {...friendsPointer}>
          <span className="friend-faces" aria-hidden="true">
            {faces.map((picture, at) => (
              <span key={at} className="friend-face" style={{ "--face": at } as CSSProperties}>
                {picture !== undefined && <img className="friend-face-picture" src={picture} alt="" draggable={false} />}
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
        </button>
      </div>
    </main>
  );
}
