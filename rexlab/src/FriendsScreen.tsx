import { FitText } from "./FitText.tsx";
import { ArrowLeft, Footprints, Heart, HeartHandshake, House } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { EarthEdge } from "./EarthEdge.tsx";
import { Picture } from "./Picture.tsx";
import { useKeptList } from "./useKeptList.ts";
import type { LayoutKeeping } from "./layoutKeeping.ts";

// Landscape cards keep the design's minimum width; upright and short
// windows have their own arrangements. The same count lays out and anchors
// the list, including when the window changes without turning.
export function friendsColumns(width: number, shape: string, left: number, right: number): number {
  if (shape.startsWith("tall")) return 2;
  if (shape === "wide-short") return 3;
  const beyondCap = Math.max(0, (width - 1440) / 2);
  const room = width - Math.max(left, beyondCap) - Math.max(right, beyondCap) - 80;
  return Math.max(1, Math.floor((room + 16) / 196));
}

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
  // Keeps where the list stands as a turn changes its columns, which
  // `columns` gives as the page now lays them out.
  layoutKeeping: LayoutKeeping;
  columns: () => number;
};

export function FriendsScreen({ language, friends, nestPicture, onFriend, onNewVisitor, onBack, onHome, layoutKeeping, columns }: FriendsScreenProps) {
  const text = TEXTS[language];
  const list = useKeptList(layoutKeeping, columns);
  const empty = friends.length === 0;
  const count = columns();
  return (
    <main className="friends friends-dig-site" style={{ "--friends-columns": count } as CSSProperties}>
      <header className="friends-sky">
        <div className="friends-bar">
          <Button className="friends-home" aria-label={text.home} onClick={onHome}>
            <House aria-hidden="true" /><span>{text.home}</span>
          </Button>
          <Button className="friends-back" aria-label={text.back} onClick={onBack}>
            <ArrowLeft aria-hidden="true" /><span>{text.back}</span>
          </Button>
          <div className="friends-heading">
            <h1 className="friends-title">
              <span className="friends-mark" aria-hidden="true"><HeartHandshake /></span>
              <FitText className="friends-title-word" text={text.friends} />
            </h1>
            <p className="friend-count" aria-label={text.friends}>
              <Heart aria-hidden="true" fill="currentColor" />{friends.length}
            </p>
          </div>
          {!empty && <div className="friends-invite">
            <Button className="new-visitor-button" onClick={onNewVisitor}>
              <Footprints aria-hidden="true" />{text.newVisitor}
            </Button>
          </div>}
        </div>
      </header>
      <section className="friends-sand">
        <EarthEdge className="friends-sand-wave" />
        {empty ? (
          <div className="no-friends">
            <span className="no-friends-picture" aria-hidden="true">
              <Picture className="no-friends-nest" src={nestPicture} alt="" width={400} height={300} />
            </span>
            <p className="no-friends-text">{text.noFriends}</p>
            <Button className="no-friends-button" onClick={onNewVisitor}>
              <Footprints aria-hidden="true" />{text.newVisitor}
            </Button>
          </div>
        ) : (
          <div ref={list.ref} onScroll={list.onScroll} className="friends-grid" data-turn-part="care-friends-grid" role="group" aria-label={text.friends}>
            {friends.map((friend, index) => (
              <FriendCard key={friend.id} friend={friend} language={language} place={index < count ? index : 0} onFriend={onFriend} />
            ))}
          </div>
        )}
      </section>
      <div className="friends-bedrock" aria-hidden="true"><EarthEdge /></div>
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
    <Button className="card friend-card" aria-label={name} data-turn-part={`care-friend-${id}`} style={{ "--card": place } as CSSProperties} onClick={() => onFriend(id)}>
      <span className="friend-art">
        <Picture className="friend-picture" src={picture} alt="" width={800} height={600} />
        <Footprints className="friend-failure" size={40} aria-hidden="true" />
      </span>
      <span className="friend-footer">
        <FitText className="friend-name" text={name.toLocaleUpperCase(language)} />
      </span>
    </Button>
  );
}
