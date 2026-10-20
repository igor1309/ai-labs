import { ArrowLeft, Footprints, Heart, HeartHandshake, House } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";

// The cards in a row of friends.
const COLUMNS = 4;

export type FriendView = {
  id: string;
  name: string;
  // The URL of the friend's picture.
  picture: string;
};

export type FriendsScreenProps = {
  language: Language;
  friends: readonly FriendView[];
  // The URL of the nest on the picture inviting a first visitor.
  nestPicture: string;
  onFriend: (id: string) => void;
  onNewVisitor: () => void;
  onBack: () => void;
  onHome: () => void;
};

export function FriendsScreen({ language, friends, nestPicture, onFriend, onNewVisitor, onBack, onHome }: FriendsScreenProps) {
  const text = TEXTS[language];
  const empty = friends.length === 0;
  return (
    <main className="friends">
      <header className="friends-bar">
        <Button className="home-button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          {text.back}
        </Button>
        {/* With no friends yet the way on is the big NEW VISITOR below,
            and BACK is the only other choice. */}
        {!empty && (
          <Button className="home-button" onClick={onHome}>
            <House size={24} aria-hidden="true" />
            {text.home}
          </Button>
        )}
        <h1 className="friends-title">
          <span className="friends-mark" aria-hidden="true">
            <HeartHandshake size={28} />
          </span>
          {text.friends}
        </h1>
        {!empty && (
          <>
            <p className="friend-count" aria-label={text.friends}>
              <Heart size={20} aria-hidden="true" />
              {friends.length}
            </p>
            <Button className="new-visitor-button" onClick={onNewVisitor}>
              <Footprints size={24} aria-hidden="true" />
              {text.newVisitor}
            </Button>
          </>
        )}
      </header>
      {empty ? (
        <div className="no-friends">
          <span className="no-friends-picture" aria-hidden="true">
            <Picture className="no-friends-nest" src={nestPicture} alt="" width={400} height={300} />
            <span className="no-friends-bubble">
              <Heart size={60} fill="currentColor" />
            </span>
          </span>
          <p className="no-friends-text">{text.noFriends}</p>
          <Button className="play-again-button no-friends-button" onClick={onNewVisitor}>
            <Footprints size={30} aria-hidden="true" />
            {text.newVisitor}
          </Button>
        </div>
      ) : (
        <div className="friends-grid" role="group" aria-label={text.friends}>
          {friends.map((friend, index) => (
            <FriendCard key={friend.id} friend={friend} language={language} place={Math.min(index, COLUMNS - 1)} onFriend={onFriend} />
          ))}
        </div>
      )}
    </main>
  );
}

type FriendCardProps = {
  friend: FriendView;
  language: Language;
  // The card's place in the stagger of the cards rising in: only the
  // first row is staggered, so the friends are quick to arrive.
  place: number;
  onFriend: (id: string) => void;
};

function FriendCard({ friend: { id, name, picture }, language, place, onFriend }: FriendCardProps) {
  return (
    <Button className="card friend-card" aria-label={name} style={{ "--card": place } as CSSProperties} onClick={() => onFriend(id)}>
      <span className="friend-art">
        <Picture className="friend-picture" src={picture} alt="" width={800} height={600} />
      </span>
      <span className="friend-footer">
        <Heart size={20} fill="currentColor" aria-hidden="true" />
        <span className="friend-name">{name.toLocaleUpperCase(language)}</span>
      </span>
    </Button>
  );
}
