import { House, LibraryBig, Play, ShelvingUnit } from "lucide-react";
import type { ReactNode } from "react";
import type { AgeLevel } from "./ageLevel.ts";
import { Button } from "./Button.tsx";
import { EarthEdge } from "./EarthEdge.tsx";
import { FitText } from "./FitText.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelSwitch } from "./LevelSwitch.tsx";
import { Picture, PictureImage, usePicture } from "./Picture.tsx";
import { Tooth } from "./Tooth.tsx";

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

// The dig site: the title in the sky, the jaw beside its dinosaur and the
// controls on the sand, and the bedrock below.
export function WhoseJawWelcomeScreen({ audioControl, language, level, best, collected, total, jawPicture, gummyPicture, onLevel, onPlay, onShelf, onHome }: WhoseJawWelcomeScreenProps) {
  const text = TEXTS[language];
  return <main className="whose-jaw-welcome">
    <header className="whose-jaw-welcome-sky">
      <div className="whose-jaw-welcome-bar">
        <Button className="whose-jaw-welcome-home" aria-label={text.home} onClick={onHome}><House aria-hidden="true" /><span>{text.home}</span></Button>
        {audioControl}
      </div>
      <h1 className="whose-jaw-welcome-title">
        <span className="whose-jaw-welcome-mark"><Tooth /></span>
        <FitText className="whose-jaw-welcome-word" text={text.whoseJaw} />
      </h1>
    </header>
    <section className="whose-jaw-welcome-sand">
      <EarthEdge className="whose-jaw-welcome-wave" />
      <div className="whose-jaw-welcome-body">
        <WelcomeHero jawPicture={jawPicture} gummyPicture={gummyPicture} />
        <div className="whose-jaw-start">
          <div className="whose-jaw-badges">
            {best !== null && <p className="whose-jaw-best" aria-label={text.bestScore}><Tooth /><span className="whose-jaw-badge-number">{best}</span></p>}
            <p className="whose-jaw-collection" aria-label={text.jawCollection}><ShelvingUnit aria-hidden="true" /><span className="whose-jaw-badge-number">{collected}</span> <span className="whose-jaw-badge-of">/ {total}</span></p>
          </div>
          <LevelSwitch language={language} level={level} onLevel={onLevel} />
          <div className="whose-jaw-welcome-actions">
            <Button className="card whose-jaw-play" onClick={onPlay}><Play aria-hidden="true" /><FitText className="whose-jaw-action-word" text={text.play} /></Button>
            <Button className="card whose-jaw-shelf" onClick={onShelf}><LibraryBig aria-hidden="true" /><FitText className="whose-jaw-action-word" text={text.jawShelf} /></Button>
          </div>
        </div>
      </div>
    </section>
    <div className="whose-jaw-welcome-bedrock" aria-hidden="true"><EarthEdge /></div>
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
