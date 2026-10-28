import { House, Landmark, Play } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { levelNameSize } from "./levelSwitchLayout.ts";
import type { AgeLevel } from "./ageLevel.ts";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelSwitch } from "./LevelSwitch.tsx";
import { Picture, PictureImage, usePicture } from "./Picture.tsx";

export type WhoseJawWelcomeScreenProps = {
  audioControl?: ReactNode;
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

export function WhoseJawWelcomeScreen({ audioControl, language, level, best, collected, total, jawPicture, gummyPicture, onLevel, onPlay, onShelf, onHome }: WhoseJawWelcomeScreenProps) {
  const text = TEXTS[language];
  const start = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const column = start.current;
    const switcher = column?.querySelector<HTMLElement>(".level-switch");
    if (!column || !switcher) return;
    const fit = () => {
      if (switcher.clientWidth > 0) column.style.setProperty("--level-name-size", `${levelNameSize(switcher.clientWidth)}px`);
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fit);
    observer?.observe(switcher);
    window.addEventListener("resize", fit);
    return () => { observer?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return <main className="whose-jaw-welcome">
    <header><Button className="home-button" aria-label={text.home} onClick={onHome}><House aria-hidden="true" /><span>{text.home}</span></Button>{audioControl}</header>
    <div className="whose-jaw-welcome-body">
      <WelcomeHero jawPicture={jawPicture} gummyPicture={gummyPicture} />
      <section ref={start} className="whose-jaw-start">
        <h1><span aria-hidden="true">🦷</span> {text.whoseJaw}</h1>
        <div className="whose-jaw-badges">
          {best !== null && <p aria-label={text.bestScore}><span aria-hidden="true">🦷</span> {best}</p>}
          <p aria-label={text.jawCollection}><Landmark aria-hidden="true" /> {collected} / {total}</p>
        </div>
        <LevelSwitch language={language} level={level} onLevel={onLevel} />
        <div className="whose-jaw-welcome-actions">
          <Button className="card whose-jaw-play" onClick={onPlay}><Play aria-hidden="true" />{text.play}</Button>
          <Button className="card whose-jaw-shelf" onClick={onShelf}><Landmark aria-hidden="true" />{text.jawShelf}</Button>
        </div>
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
