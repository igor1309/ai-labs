import { ArrowLeft, House, Landmark, Play } from "lucide-react";
import type { AgeLevel } from "./ageLevel.ts";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelSwitch } from "./LevelSwitch.tsx";
import { Picture, PictureImage, usePicture } from "./Picture.tsx";

export type WhoseJawWelcomeScreenProps = {
  language: Language;
  level: AgeLevel;
  best: number | null;
  collected: number;
  total: number;
  jawPicture: string;
  gummyPicture: string;
  onLevel: (level: AgeLevel) => void;
  onPlay: () => void;
  onShelf: () => void;
  onHome: () => void;
};

export function WhoseJawWelcomeScreen({ language, level, best, collected, total, jawPicture, gummyPicture, onLevel, onPlay, onShelf, onHome }: WhoseJawWelcomeScreenProps) {
  const text = TEXTS[language];
  return <main className="whose-jaw-welcome">
    <header><Button className="home-button" onClick={onHome}><House aria-hidden="true" />{text.home}</Button></header>
    <div className="whose-jaw-welcome-body">
      <WelcomeHero jawPicture={jawPicture} gummyPicture={gummyPicture} />
      <section className="whose-jaw-start">
        <h1><span aria-hidden="true">🦷</span> {text.whoseJaw}</h1>
        <div className="whose-jaw-badges">
          {best !== null && <p aria-label={text.bestScore}><span aria-hidden="true">🦷</span> {best}</p>}
          <p aria-label={text.jawCollection}><Landmark aria-hidden="true" /> {collected} / {total}</p>
        </div>
        <LevelSwitch language={language} level={level} onLevel={onLevel} />
        <Button className="card whose-jaw-play" onClick={onPlay}><Play aria-hidden="true" />{text.play}</Button>
        <Button className="card whose-jaw-shelf" onClick={onShelf}><Landmark aria-hidden="true" />{text.jawShelf}</Button>
      </section>
    </div>
  </main>;
}

function WelcomeHero({ jawPicture, gummyPicture }: { jawPicture: string; gummyPicture: string }) {
  const look = usePicture(jawPicture);
  const ready = look === "appearing" || look === "shown";
  return <div className="whose-jaw-hero" aria-hidden="true">
    <Picture className="whose-jaw-gummy" src={gummyPicture} alt="" width={800} height={600} />
    <div className="whose-jaw-chomp" data-ready={ready || undefined}>
      <PictureImage look={look} className="whose-jaw-jaw" src={jawPicture} alt="" width={600} height={450} />
    </div>
  </div>;
}

// These destinations keep welcome navigation usable while the board and
// interactive museum are built in their own screen steps.
export function WhoseJawDestination({ language, shelf, jawPicture, onBack, onHome }: {
  language: Language; shelf: boolean; jawPicture: string; onBack: () => void; onHome: () => void;
}) {
  const text = TEXTS[language];
  return <main className="whose-jaw-destination">
    <header><Button className="home-button" onClick={onHome}><House aria-hidden="true" />{text.home}</Button></header>
    <h1><span aria-hidden="true">{shelf ? "🏛" : "🦷"}</span> {shelf ? text.jawShelf : text.whoseJaw}</h1>
    <Picture className="whose-jaw-jaw" src={jawPicture} alt="" width={600} height={450} />
    <Button className="card" onClick={onBack}><ArrowLeft aria-hidden="true" />{text.back}</Button>
  </main>;
}
