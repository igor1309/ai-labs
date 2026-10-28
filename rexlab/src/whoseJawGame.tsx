import { useEffect, useRef, useState, type ReactNode } from "react";
import { gameAudio, type AudioPreferenceStore } from "./gameAudio.ts";
import { GameAudioButton } from "./GameAudioButton.tsx";
import type { AgeLevel, AgeLevelSetting } from "./ageLevel.ts";
import type { Language } from "./language/language.ts";
import { SCREEN_CHANGE, useScreens } from "./screens.ts";
import { startLevel, type LevelChoice } from "./startLevel.ts";
import { WhoseJawBoardScreen, type JawChoiceView } from "./WhoseJawBoardScreen.tsx";
import { advanceJaw, nextJaw, placeJaw, startJawRound, type Jaw, type JawRound } from "./whoseJaw/index.ts";
import type { StartTimer } from "./ownedTimers.ts";
import { useGateShown } from "./OrientationGate.tsx";
import { TEXTS } from "./language/texts.ts";
import { WhoseJawWelcomeScreen } from "./WhoseJawWelcomeScreen.tsx";
import { WhoseJawResultScreen, type JawResult } from "./WhoseJawResultScreen.tsx";
import { WhoseJawShelfScreen } from "./WhoseJawShelfScreen.tsx";
import { beatBest } from "./bestScore.ts";
import { acceptOffer, countBoard, NO_LEVEL_OFFER, offeredLevel, showOffer, type LevelOffer } from "./levelOffer.ts";

export type WhoseJawSaved = {
  best: Readonly<Record<AgeLevel, number | null>>;
  earned: readonly string[];
  levelChoice: LevelChoice | undefined;
  offer: LevelOffer;
};
export type WhoseJawProgressStore = {
  load(): WhoseJawSaved | undefined;
  saveLevel(choice: LevelChoice): void;
  save(saved: WhoseJawSaved): void;
};
export type WhoseJawGameProps = {
  progress: WhoseJawProgressStore;
  audioStore: AudioPreferenceStore;
  total: number;
  jawPicture: string;
  gummyPicture: string;
  jaws: readonly Jaw[];
  jawFor(id: string): string;
  gummyFor(id: string): string;
  foodFor(diet: "meat" | "plants"): string;
  mouthFor(id: string): JawChoiceView["mouth"];
  sounds: { play(sound: "snap" | "chomp" | "ow" | "hmm" | "steps" | "slide", pitch?: number): void; stop(): void };
  voice: { speak(words: string, language: Language): void; stop(): void };
};
type WhoseJawScreen = { kind: "welcome" } | { kind: "board"; round: JawRound; newly: readonly string[] }
  | { kind: "result"; result: JawResult; offer: AgeLevel | undefined } | { kind: "shelf" };
export type WhoseJawPhase = WhoseJawScreen["kind"];
const LEVELS = ["hatchling", "explorer", "paleontologist"] as const;

export function transitionFor(from: WhoseJawScreen, to: WhoseJawScreen): string | undefined {
  return from.kind === to.kind ? undefined : SCREEN_CHANGE;
}

export function useWhoseJawGame(props: WhoseJawGameProps | undefined, setting: AgeLevelSetting, onHome: () => void, onStart: () => void, random: () => number, startTimer: StartTimer, reducedMotion: () => boolean) {
  const [audio] = useState<JawAudio | undefined>(() => props && gameAudio(props.sounds, props.voice, props.audioStore));
  const [muted, setMuted] = useState<boolean>(() => audio?.muted() ?? false);
  const audioControl = (language: Language) => audio && <GameAudioButton language={language} muted={muted} onToggle={() => setMuted(audio.toggle())} />;
  const { screen, go, set } = useScreens<WhoseJawScreen>({ kind: "welcome" }, transitionFor);
  const [kept, setKept] = useState<WhoseJawSaved>(() => props?.progress.load() ?? {
    best: { hatchling: null, explorer: null, paleontologist: null }, earned: [], levelChoice: undefined, offer: NO_LEVEL_OFFER
  });
  const latest = useRef(kept);
  const level = startLevel(setting, LEVELS, kept.levelChoice);
  const keep = (next: WhoseJawSaved) => {
    latest.current = next;
    setKept(next);
    props?.progress.save(next);
  };
  const chooseLevel = (chosen: AgeLevel) => {
    if (!props || screen.kind !== "welcome" || chosen === startLevel(setting, LEVELS, latest.current.levelChoice)) return;
    const levelChoice = { level: chosen, revision: setting.revision };
    latest.current = { ...latest.current, levelChoice };
    setKept(latest.current);
    props.progress.saveLevel(levelChoice);
  };
  const welcome = () => go({ kind: "welcome" });
  const home = () => go({ kind: "welcome" }, { also: onHome });
  const play = () => go((current) => props && (current.kind === "welcome" || current.kind === "result")
    ? { kind: "board", newly: [], round: startJawRound(props.jaws, startLevel(setting, LEVELS, latest.current.levelChoice), random) } : current, { also: onStart });
  const place = (round: JawRound, id: string) => {
    if (screen.kind !== "board" || screen.round !== round) return;
    const next = placeJaw(round, id);
    if (next === round) return;
    const owner = round.questions[round.placed.length]!.owner.id;
    const collected = next.phase === "right" && !latest.current.earned.includes(owner);
    const from = screen;
    go((current) => current === from ? { ...from, round: next, newly: collected ? [...from.newly, owner] : from.newly } : current, {
      also: () => { if (collected) keep({ ...latest.current, earned: [...latest.current.earned, owner] }); }
    });
  };
  const advance = (round: JawRound) => {
    if (!props || screen.kind !== "board" || screen.round !== round) return;
    const from = screen;
    if (round.phase !== "done") {
      go((current) => current === from ? { ...from, round: advanceJaw(round) } : current);
      return;
    }
    const stars = round.errors === 0 ? 3 : round.errors === 1 ? 2 : 1;
    const previous = latest.current.best[round.level];
    const { best, celebration } = beatBest(previous, stars);
    const offer = countBoard(latest.current.offer, round.level, round.errors <= 1);
    const result: JawResult = { stars, best, celebration, beaten: celebration === "new-best" ? previous ?? undefined : undefined,
      jaws: round.placed.map(({ id }) => ({ id, name: props.jaws.find((jaw) => jaw.id === id)!.name, picture: props.jawFor(id), newly: from.newly.includes(id) })) };
    go((current) => current === from ? { kind: "result", result, offer: offeredLevel(offer) } : current, {
      also: () => keep({ ...latest.current, best: { ...latest.current.best, [round.level]: best }, offer })
    });
  };
  const next = (round: JawRound) => {
    if (screen.kind !== "board" || screen.round !== round) return;
    const changed = nextJaw(round);
    if (changed === round) return;
    const from = screen;
    go((current) => current === from ? { ...from, round: changed } : current);
  };
  const shelf = () => go((current) => current.kind === "welcome" || current.kind === "result" ? { kind: "shelf" } : current);
  const content = (language: Language) => !props || !audio ? null : screen.kind === "welcome"
    ? <WhoseJawWelcomeScreen audioControl={audioControl(language)} language={language} level={level} best={kept.best[level]} collected={kept.earned.length} total={props.total}
        jawPicture={props.jawPicture} gummyPicture={props.gummyPicture} onLevel={chooseLevel} onPlay={play} onShelf={shelf} onHome={home} />
    : screen.kind === "board" ? <BoardVisit audio={audio} audioControl={audioControl(language)} props={props} round={screen.round} language={language} startTimer={startTimer} reducedMotion={reducedMotion}
        onPlace={(id) => place(screen.round, id)} onAdvance={() => advance(screen.round)} onNext={() => next(screen.round)} onBack={welcome} onHome={home} />
    : screen.kind === "result" ? <WhoseJawResultScreen audioControl={audioControl(language)} language={language} result={screen.result} onPlayAgain={play} onShelf={shelf} onHome={home}
        offer={screen.offer ? { level: screen.offer, startTimer,
          onShown: () => keep({ ...latest.current, offer: showOffer(latest.current.offer) }),
          onYes: () => keep({ ...latest.current, offer: acceptOffer(latest.current.offer), levelChoice: { level: screen.offer!, revision: setting.revision } }),
          onNotNow: () => {}
        } : undefined} />
    : <WhoseJawShelfScreen audioControl={audioControl(language)} language={language} jaws={props.jaws} earned={kept.earned} jawFor={props.jawFor} gummyFor={props.gummyFor}
        sounds={audio.sounds} voice={audio.voice} startTimer={startTimer} onBack={welcome} onHome={home} />;
  return { content, phase: screen.kind, best: kept.best[level], collected: kept.earned.length, open: () => set({ kind: "welcome" }), openShelf: () => set({ kind: "shelf" }) };
}

export const JAW_TIMING = { entering: 240, right: 1350, wrong: 1200, done: 320, reduced: 160, reducedWrong: 800 };

type JawAudio = ReturnType<typeof gameAudio<Parameters<WhoseJawGameProps["sounds"]["play"]>[0]>>;

function BoardVisit({ props, audio, audioControl, round, language, startTimer, reducedMotion, onPlace, onAdvance, onNext, onBack, onHome }: {
  props: WhoseJawGameProps; audio: JawAudio; audioControl: ReactNode; round: JawRound; language: Language; startTimer: StartTimer; reducedMotion(): boolean;
  onPlace(id: string): void; onAdvance(): void; onNext(): void; onBack(): void; onHome(): void;
}) {
  const gate = useGateShown();
  const text = TEXTS[language];
  // The completed board keeps its last pictures during the tooth celebration.
  const question = round.questions[Math.min(round.placed.length, 4)]!;
  const { owner, choices } = question;
  const target = choices.find(({ id }) => id === round.target);
  const shape = round.level === "paleontologist";
  const reaction = shape && target ? { words: target.hint[language], symbol: "📏" }
    : owner.diet === "meat" ? { words: text.jawOw, symbol: "🌿" } : { words: text.jawHmm, symbol: "🥩" };
  const correct = round.phase === "right" || round.phase === "reading";
  const feedback = round.phase === "wrong" ? reaction : correct && round.level === "paleontologist"
    ? { words: owner.fact[language], symbol: "🦷" } : undefined;

  useEffect(() => () => { audio.voice.stop(); audio.sounds.stop(); }, [audio]);
  useEffect(() => {
    if (gate) { audio.voice.stop(); audio.sounds.stop(); return; }
    if (round.phase === "waiting" || round.phase === "reading") return;
    let active = true;
    const stops: Array<() => void> = [];
    const later = (ms: number, action: () => void) => stops.push(startTimer(ms, () => { if (active) action(); }));
    const reduced = reducedMotion();
    const { sounds, voice } = audio.sequence();
    if (round.phase === "right") {
      sounds.play("snap");
      later(reduced ? 80 : 150, () => sounds.play("chomp"));
      if (!reduced) later(850, () => sounds.play("steps"));
    } else if (round.phase === "wrong") {
      sounds.play(shape ? "slide" : owner.diet === "meat" ? "ow" : "hmm");
    }
    if (feedback) voice.speak(feedback.words, language);
    const delay = reduced ? (round.phase === "wrong" ? JAW_TIMING.reducedWrong : JAW_TIMING.reduced) : JAW_TIMING[round.phase];
    later(delay, onAdvance);
    return () => { active = false; stops.forEach((stop) => stop()); sounds.stop(); };
  }, [round, gate, startTimer, reducedMotion, language, audio]);

  return <WhoseJawBoardScreen audioControl={audioControl} key={owner.id} language={language} phase={round.phase} choices={choices.map((jaw) => ({
    id: jaw.id, name: jaw.name[language].toLocaleUpperCase(language), picture: props.gummyFor(jaw.id), food: props.foodFor(jaw.diet), diet: jaw.diet, mouth: props.mouthFor(jaw.id)
  }))} jawPicture={props.jawFor(owner.id)} placed={round.phase === "reading" ? [...round.placed, { firstTry: round.misses === 0 }] : round.placed} target={round.target}
    hint={round.misses >= 2 ? owner.id : undefined} jawDiet={owner.diet} foodShown={round.level === "hatchling"}
    namesShown={round.level === "paleontologist"} feedback={feedback} onPlace={onPlace} onNext={onNext}
    onName={(id) => { const jaw = choices.find((jaw) => jaw.id === id); if (jaw) audio.voice.speak(jaw.name[language], language); }}
    onSlide={() => audio.sounds.play("slide")} onBack={onBack} onHome={onHome} />;
}
