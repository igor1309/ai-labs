import { useRef, useState } from "react";
import { beatBest } from "./bestScore.ts";
import {
  finishVisit,
  friendsOf,
  give,
  isFinished,
  MOST_HEARTS,
  NO_CARE,
  pickVisitor,
  settle,
  startVisit,
  type CareProgress,
  type CareResult,
  type Item,
  type KeptCare,
  type Random,
  type Reaction,
  type Visit,
  type Visitor
} from "./care/index.ts";
import { CareResultScreen } from "./CareResultScreen.tsx";
import { CareWelcomeScreen } from "./CareWelcomeScreen.tsx";
import { FriendsScreen } from "./FriendsScreen.tsx";
import type { Language } from "./language/language.ts";
import { ownedTimers, type OwnedTimers, type StartTimer } from "./ownedTimers.ts";
import { presentCareResult, presentFriend, presentVisit } from "./presentation.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { VisitScreen, type CareItem } from "./VisitScreen.tsx";
import type { LayoutKeeping } from "./useKeptRow.ts";

export type CareProgressStore = {
  // The care progress kept so far, or undefined when it cannot be read at
  // all.
  load(): CareProgress | undefined;
  save(progress: CareProgress): void;
};

export type CareGameProps = {
  // Every dinosaur that may visit, in the shared dinosaur list's order.
  visitors: readonly Visitor[];
  careProgress: CareProgressStore;
  bodyPicture: (dinosaurId: string) => string;
  // The URL of the picture of each care item, and of the empty bowl.
  itemPicture: (name: string) => string;
  random: Random;
  startTimer: StartTimer;
  // Whether the device asks for reduced motion now.
  reducedMotion: () => boolean;
};

const GIVEN: Record<CareItem, Item> = { plants: "plants", meat: "meat", water: "water", bath: "bath", nest: "nest" };

// The dinosaur waiting at the door on the NEW VISITOR card.
const DOORSTEP = "brachiosaurus";

// How long each reaction plays before the visit goes on, in milliseconds,
// as app.css times it: an item flies to the visitor (--motion-screen),
// then it hops twice (0.8 × --motion-count) or turns away
// (1.5 × --motion-standard); the happy visitor dances three hops
// (1.6 × --motion-count) and walks off (--motion-screen). With reduced
// motion the same steps are only the short fades the tokens leave: the
// hearts' pop and fade end last of a happy reaction, the item's fade back
// of a refusal.
const REACTIONS: Record<"motion" | "reduced", Record<Reaction | "departure", number>> = {
  motion: { happy: 800, refusal: 680, departure: 1280 },
  reduced: { happy: 480, refusal: 400, departure: 160 }
};

type CareScreen =
  | { kind: "welcome" }
  | { kind: "visit"; visit: Visit; leaving: boolean }
  | { kind: "result"; result: CareResult }
  | { kind: "friends" };
export type CarePhase = CareScreen["kind"];

// A reaction plays inside the visit, which changes at once; every other
// change is the plain screen change.
export function transitionFor(from: CareScreen, to: CareScreen): string | undefined {
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

// Dinosaur care, kept by the app above its orientation gate, so turning
// the iPad pauses a visit without losing it. `onHome` takes the child
// back to the home page; `onStart` is told as each visit begins.
export function useCareGame(
  { visitors, careProgress, bodyPicture, itemPicture, random, startTimer, reducedMotion }: CareGameProps,
  onHome: () => void,
  onStart: () => void,
  // How FRIENDS keeps its list's place through a turn, and its columns
  // as the page now lays them out.
  friendsLayout: { keeping: LayoutKeeping; columns: () => number }
) {
  const { screen, go, set } = useScreens<CareScreen>({ kind: "welcome" }, transitionFor);
  // Progress is read once, as the app opens. When it cannot be read there
  // is no best to compare with, but friends made meanwhile are still kept
  // while the app is open, and so are progress and friends that cannot be
  // saved.
  const [kept, setKept] = useState<KeptCare>(() => {
    const stored = careProgress.load();
    return { progress: stored ?? NO_CARE, readable: stored !== undefined };
  });
  const keptNow = useRef(kept);
  // The visit in play, ahead of the screen: a second tap, or a reaction's
  // timer, acts on the visit as it is, not as last rendered. Null once the
  // child leaves it.
  const live = useRef<Visit | null>(null);
  // The reaction and departure timers of the visit in play, all stopped as
  // the child leaves it, and null from then on.
  const visitTimers = useRef<OwnedTimers | null>(null);
  // The visitor of the last visit started, so the next one is another.
  const lastVisitor = useRef<string | undefined>(undefined);

  const timings = () => REACTIONS[reducedMotion() ? "reduced" : "motion"];

  const leave = () => {
    live.current = null;
    visitTimers.current?.stopAll();
    visitTimers.current = null;
  };

  // A visit starts at once, its visitor's picture loading as it walks
  // in. A second tap in the same change starts no other visit.
  const welcome = (visitor: Visitor) => {
    const visit = startVisit(visitor);
    go((current) => (current.kind === "visit" ? current : { kind: "visit", visit, leaving: false }), {
      also: () => {
        live.current = visit;
        visitTimers.current = ownedTimers(startTimer);
        lastVisitor.current = visitor.id;
        onStart();
      }
    });
  };

  const newVisitor = () => welcome(pickVisitor(visitors, random, lastVisitor.current));

  // The visit is recorded the moment its last need is met, before the
  // visitor dances away: leaving, or reloading, during the departure
  // cannot lose it or record it twice. Unreadable progress is not saved
  // over.
  const record = (visit: Visit): CareResult => {
    const finished = finishVisit(
      keptNow.current,
      visit,
      visitors.map(({ id }) => id),
      beatBest
    );
    keptNow.current = finished.kept;
    setKept(finished.kept);
    if (finished.kept.readable) careProgress.save(finished.kept.progress);
    return finished.result;
  };

  // Each update moves from the visit it is given, so a reaction that ends
  // after the child has left, or after the visit has moved on, changes
  // nothing.
  const showVisit = (from: Visit, to: Visit, leaving = false) => {
    live.current = to;
    go((current) => (current.kind === "visit" && current.visit === from ? { kind: "visit", visit: to, leaving } : current));
  };

  const giveItem = (item: Item) => {
    const from = live.current;
    const timers = visitTimers.current;
    if (from === null || timers === null) return;
    const given = give(from, item);
    if (given === from || given.reacting === null) return;
    const result = isFinished(given) ? record(given) : undefined;
    showVisit(from, given);
    const timing = timings();
    timers.start(timing[given.reacting.reaction], () => {
      if (live.current !== given) return;
      const settled = settle(given);
      showVisit(given, settled, result !== undefined);
      if (result === undefined) return;
      timers.start(timing.departure, () => {
        if (live.current !== settled) return;
        live.current = null;
        go({ kind: "result", result });
      });
    });
  };

  const home = () => {
    leave();
    onHome();
  };

  const friends = friendsOf(kept.progress.friends, visitors);

  const callBack = (id: string) => {
    const friend = visitors.find((visitor) => visitor.id === id);
    if (friend) welcome(friend);
  };

  const content = (language: Language) => {
    switch (screen.kind) {
      case "welcome":
        return (
          <CareWelcomeScreen
            language={language}
            best={kept.readable ? (kept.progress.bestScore ?? undefined) : undefined}
            total={MOST_HEARTS}
            visitorPicture={bodyPicture(DOORSTEP)}
            friendCount={friends.length}
            friendPictures={friends.map(({ id }) => bodyPicture(id))}
            onNewVisitor={newVisitor}
            onFriends={() => go({ kind: "friends" })}
            onHome={home}
          />
        );
      case "visit":
        return (
          <VisitScreen
            language={language}
            visit={presentVisit(screen.visit, screen.leaving, language, bodyPicture)}
            itemPicture={itemPicture}
            onGive={(item) => giveItem(GIVEN[item])}
            onHome={home}
          />
        );
      case "result":
        return (
          <CareResultScreen
            language={language}
            {...presentCareResult(screen.result, language, bodyPicture)}
            onNewVisitor={newVisitor}
            onFriends={() => go({ kind: "friends" })}
            onHome={home}
          />
        );
      case "friends":
        return (
          <FriendsScreen
            language={language}
            friends={friends.map((friend) => presentFriend(friend, language, bodyPicture))}
            nestPicture={itemPicture("nest")}
            onFriend={callBack}
            onNewVisitor={newVisitor}
            onBack={() => go({ kind: "welcome" })}
            onHome={home}
            layoutKeeping={friendsLayout.keeping}
            columns={friendsLayout.columns}
          />
        );
    }
  };

  return {
    // The best score on care's home tile, undefined while there is none to
    // show.
    best: kept.readable ? (kept.progress.bestScore ?? undefined) : undefined,
    // Care opens on its welcome screen, whatever screen it was left on.
    open: () => {
      leave();
      set({ kind: "welcome" });
    },
    content,
    // The screen shown, for the window's layout.
    phase: screen.kind
  };
}
