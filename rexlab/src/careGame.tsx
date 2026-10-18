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
import { waitForPictures, type LoadPicture, type StartTimer } from "./pictureWait.ts";
import { presentCareResult, presentFriend, presentVisit } from "./presentation.ts";
import { changeScreen, SCREEN_CHANGE } from "./screenChange.ts";
import { VisitScreen, type CareItem } from "./VisitScreen.tsx";

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
  loadPicture: LoadPicture;
  startTimer: StartTimer;
  // Whether the device asks for reduced motion now.
  reducedMotion: () => boolean;
};

const GIVEN: Record<CareItem, Item> = { plants: "plants", meat: "meat", water: "water", bath: "bath", nest: "nest" };

// The dinosaur waiting at the door on the NEW VISITOR card.
const DOORSTEP = "brachiosaurus";

// The longest a visit waits for its visitor's picture, in milliseconds, as
// a question does for its pictures.
const PICTURE_WAIT = 1000;

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

// Dinosaur care, kept by the app above its orientation gate, so turning
// the iPad pauses a visit without losing it. `onHome` takes the child
// back to the home page; `onStart` is told as each visit begins.
export function useCareGame(
  { visitors, careProgress, bodyPicture, itemPicture, random, loadPicture, startTimer, reducedMotion }: CareGameProps,
  onHome: () => void,
  onStart: () => void
) {
  const [screen, setScreen] = useState<CareScreen>({ kind: "welcome" });
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
  // A visit being started while its visitor's picture loads: a second tap
  // meanwhile starts nothing more.
  const starting = useRef(false);
  // Counts each time the child leaves care, so a picture that finishes
  // loading after the child has left starts no visit.
  const stay = useRef(0);
  // The visitor of the last visit started, so the next one is another.
  const lastVisitor = useRef<string | undefined>(undefined);

  const show = (next: CareScreen) => changeScreen(SCREEN_CHANGE, () => setScreen(next));

  const timings = () => REACTIONS[reducedMotion() ? "reduced" : "motion"];

  const leave = () => {
    stay.current++;
    live.current = null;
    starting.current = false;
  };

  // A visit starts once its visitor's picture is ready, or the wait runs
  // out, and only if the child is still in care.
  const welcome = (visitor: Visitor) => {
    if (starting.current) return;
    starting.current = true;
    const visiting = stay.current;
    waitForPictures([bodyPicture(visitor.id)], { loadPicture, startTimer, limit: PICTURE_WAIT }, () => {
      if (stay.current !== visiting) return;
      starting.current = false;
      const visit = startVisit(visitor);
      live.current = visit;
      lastVisitor.current = visitor.id;
      onStart();
      show({ kind: "visit", visit, leaving: false });
    });
  };

  const newVisitor = () => {
    if (starting.current) return;
    welcome(pickVisitor(visitors, random, lastVisitor.current));
  };

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
    setScreen((current) => (current.kind === "visit" && current.visit === from ? { kind: "visit", visit: to, leaving } : current));
  };

  const giveItem = (item: Item) => {
    const from = live.current;
    if (from === null) return;
    const given = give(from, item);
    if (given === from || given.reacting === null) return;
    const result = isFinished(given) ? record(given) : undefined;
    showVisit(from, given);
    const timing = timings();
    startTimer(timing[given.reacting.reaction], () => {
      if (live.current !== given) return;
      const settled = settle(given);
      showVisit(given, settled, result !== undefined);
      if (result === undefined) return;
      startTimer(timing.departure, () => {
        if (live.current !== settled) return;
        live.current = null;
        show({ kind: "result", result });
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
            onFriends={() => show({ kind: "friends" })}
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
            onFriends={() => show({ kind: "friends" })}
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
            onBack={() => show({ kind: "welcome" })}
            onHome={home}
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
      setScreen({ kind: "welcome" });
    },
    content
  };
}
