import { ArrowLeft, House, Landmark, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { useGateShown } from "./OrientationGate.tsx";
import type { StartTimer } from "./ownedTimers.ts";
import { Picture, PictureImage, usePicture } from "./Picture.tsx";
import { afterResultAnimations } from "./resultAnimation.ts";

type ShelfJaw = { id: string; name: Record<Language, string>; diet: "meat" | "plants"; fact: Record<Language, string> };
type ShelfSounds = { play(sound: "chomp", pitch: number): void; stop(): void };
type ShelfVoice = { speak(words: string, language: Language): void; stop(): void };
type ShelfCard = { id: string; leaving: boolean };
export type WhoseJawShelfScreenProps = {
  language: Language;
  jaws: readonly ShelfJaw[];
  earned: readonly string[];
  jawFor(id: string): string;
  gummyFor(id: string): string;
  sounds: ShelfSounds;
  voice: ShelfVoice;
  startTimer: StartTimer;
  onBack(): void;
  onHome(): void;
};

export function WhoseJawShelfScreen({ language, jaws, earned, jawFor, gummyFor, sounds, voice, startTimer, onBack, onHome }: WhoseJawShelfScreenProps) {
  const text = TEXTS[language];
  const [card, setCard] = useState<ShelfCard | undefined>();
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (!card) opener.current?.focus(); }, [card]);
  const selected = jaws.find(({ id }) => id === card?.id);
  // Keep diets together so the pictures on each shelf explain its collection.
  const ordered = [...jaws.filter(({ diet }) => diet === "plants"), ...jaws.filter(({ diet }) => diet === "meat")];
  const rows = Array.from({ length: Math.ceil(ordered.length / 4) }, (_, row) => ordered.slice(row * 4, row * 4 + 4));
  return <main className="whose-jaw-shelf-screen">
    <div inert={card !== undefined} aria-hidden={card ? true : undefined}>
      <header className="jaw-shelf-bar">
        <Button className="home-button" onClick={onBack}><ArrowLeft aria-hidden="true" />{text.back}</Button>
        <h1><Landmark aria-hidden="true" />{text.jawShelf}</h1>
        <Button className="home-button" onClick={onHome}><House aria-hidden="true" />{text.home}</Button>
      </header>
      <p className="jaw-shelf-count" aria-label={text.jawCollection}>🦷 {jaws.filter(({ id }) => earned.includes(id)).length} / {jaws.length}</p>
      <div className="jaw-shelves" role="group" aria-label={text.jawShelf}>
        {rows.map((row, index) => <section className="jaw-shelf-row" key={index}>
          <div className="jaw-shelf-labels">{[...new Set(row.map(({ diet }) => diet))].map((diet) => <span key={diet}><span aria-hidden="true">{diet === "meat" ? "🥩" : "🌿"}</span> {text.jawFoods[diet]}</span>)}</div>
          <div className="jaw-shelf-places">{row.map((jaw) => {
            const unlocked = earned.includes(jaw.id);
            const name = jaw.name[language].toLocaleUpperCase(language);
            return <Button key={jaw.id} className="jaw-shelf-place" disabled={!unlocked} data-unlocked={unlocked || undefined}
              aria-label={unlocked ? name : "?"} onClick={(event) => {
                if (card) return;
                opener.current = event.currentTarget;
                setCard({ id: jaw.id, leaving: false });
              }}>
              <Picture className={unlocked ? "jaw-shelf-picture" : "jaw-shelf-picture jaw-shelf-silhouette"} src={jawFor(jaw.id)} alt="" width={600} height={450} />
              <span className="jaw-shelf-name">{unlocked ? name : "?"}</span>
            </Button>;
          })}</div>
        </section>)}
      </div>
    </div>
    {selected && card && <JawCard key={selected.id} jaw={selected} language={language} jawPicture={jawFor(selected.id)} gummyPicture={gummyFor(selected.id)}
      pitch={0.8 + jaws.indexOf(selected) * 0.04} sounds={sounds} voice={voice} startTimer={startTimer} leaving={card.leaving}
      onClose={() => setCard({ ...card, leaving: true })} onGone={() => setCard(undefined)} />}
  </main>;
}

function JawCard({ jaw, language, jawPicture, gummyPicture, pitch, sounds, voice, startTimer, leaving, onClose, onGone }: {
  jaw: ShelfJaw; language: Language; jawPicture: string; gummyPicture: string; pitch: number;
  sounds: ShelfSounds; voice: ShelfVoice; startTimer: StartTimer; leaving: boolean; onClose(): void; onGone(): void;
}) {
  const text = TEXTS[language];
  const title = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onGone });
  callbacks.current = { onGone };
  const gate = useGateShown();
  const look = usePicture(jawPicture);
  const gummyLook = usePicture(gummyPicture);
  const settled = look !== "loading" && gummyLook !== "loading";
  const ready = settled && look !== "failed" && gummyLook !== "failed" && !gate && !leaving;
  useEffect(() => {
    if (gate || leaving) return;
    close.current?.focus();
  }, [gate, leaving]);
  useEffect(() => {
    if (gate || leaving || !settled) return;
    voice.speak(`${jaw.name[language]}. ${jaw.fact[language]}`, language);
    sounds.play("chomp", pitch);
    return () => { voice.stop(); sounds.stop(); };
  }, [gate, leaving, settled, jaw, language, voice, sounds, pitch]);
  useEffect(() => {
    if (gate || !leaving || !overlay.current) return;
    return afterResultAnimations([overlay.current], startTimer, () => callbacks.current.onGone());
  }, [gate, leaving, startTimer]);
  return <div ref={overlay} className="jaw-card-scrim" data-leaving={leaving || undefined}
    onClick={(event) => { if (event.target === event.currentTarget && !leaving) onClose(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && !leaving) { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") { event.preventDefault(); close.current?.focus(); }
    }}>
    <section className="jaw-shelf-card" role="dialog" aria-modal="true" aria-labelledby={title}>
      <Button ref={close} className="home-button" aria-disabled={leaving} onClick={() => { if (!leaving) onClose(); }}><X aria-hidden="true" />{text.back}</Button>
      <h2 id={title}>{jaw.name[language].toLocaleUpperCase(language)}</h2>
      <div className="jaw-card-pictures">
        <PictureImage look={gummyLook} className="jaw-card-dinosaur" src={gummyPicture} alt={jaw.name[language].toLocaleUpperCase(language)} width={800} height={600} />
        <div className="jaw-card-chomp" data-ready={ready || undefined}><PictureImage look={look} className="jaw-card-jaw" src={jawPicture} alt="" width={600} height={450} /></div>
      </div>
      <p className="jaw-card-diet"><span aria-hidden="true">{jaw.diet === "meat" ? "🥩" : "🌿"}</span> {text.jawFoods[jaw.diet]}</p>
      <p className="jaw-card-fact">🦷 {jaw.fact[language].toLocaleUpperCase(language)}</p>
    </section>
  </div>;
}
