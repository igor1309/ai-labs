import { House, LibraryBig, RotateCcw, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import { EarthEdge } from "./EarthEdge.tsx";
import { FitText } from "./FitText.tsx";
import { Tooth } from "./Tooth.tsx";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelOfferDialog, type LevelOfferProps } from "./LevelOfferDialog.tsx";
import { useGateShown } from "./OrientationGate.tsx";
import { Picture } from "./Picture.tsx";
import { afterResultAnimations } from "./resultAnimation.ts";
import { BestScore, CelebrationChip, motion, type Celebration } from "./ResultParts.tsx";

export type JawResult = {
  stars: number;
  best: number;
  beaten: number | undefined;
  celebration: Celebration | null;
  jaws: readonly { id: string; name: Record<Language, string>; picture: string; newly: boolean }[];
};

export type WhoseJawResultScreenProps = {
  audioControl?: ReactNode;
  language: Language;
  result: JawResult;
  offer?: LevelOfferProps | undefined;
  onPlayAgain(): void;
  onShelf(): void;
  onHome(): void;
};

export function WhoseJawResultScreen({ audioControl, language, result, offer, onPlayAgain, onShelf, onHome }: WhoseJawResultScreenProps) {
  const text = TEXTS[language];
  const gate = useGateShown();
  const main = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<"waiting" | "shown" | "leaving" | "gone">("waiting");
  const latest = useRef(offer);
  latest.current = offer;
  const startTimer = offer?.startTimer;
  const blocked = phase === "shown" || phase === "leaving";
  useEffect(() => {
    if (gate || phase !== "waiting" || !startTimer || !main.current) return;
    return afterResultAnimations([...main.current.querySelectorAll(".star-won, .celebration, .jaw-result-jaws li, .jaw-result-find")], startTimer, () => setPhase("shown"));
  }, [gate, phase, startTimer]);
  useEffect(() => {
    if (!gate && phase === "gone") main.current?.querySelector<HTMLButtonElement>(".jaw-result-actions button")?.focus();
  }, [gate, phase]);
  const shown = latest.current;
  const discoveries = result.jaws.filter(({ newly }) => newly);
  return <>
    <main ref={main} className="whose-jaw-result" inert={blocked}>
      <div className="jaw-result-sand" aria-hidden="true"><EarthEdge className="jaw-result-wave" /></div>
      <div className="jaw-result-bedrock" aria-hidden="true"><EarthEdge /></div>
      {audioControl && <div className="jaw-result-audio" aria-hidden={blocked || undefined}>{audioControl}</div>}
      <div className="jaw-result-body">
        <div className="jaw-result-pile">
          {(result.celebration || discoveries.length > 0) && <Festivity />}
          <ul className="jaw-result-jaws" aria-label={text.jawProgress}>
            {result.jaws.map(({ id, name, picture }, index) => <li key={id} style={motion({ "--jaw": index })}>
              <Picture className="jaw-result-picture" src={picture} alt={name[language].toLocaleUpperCase(language)} width={600} height={450} />
            </li>)}
          </ul>
        </div>
        <div className="jaw-result-rewards">
          <p className="result-stars" role="img" aria-label={text.stars(result.stars, 3)}>
            {[0, 1, 2].map((index) => <span key={index} className={`star ${index < result.stars ? "star-won" : "star-empty"}`}
              style={motion({ "--star": index })} aria-hidden="true"><Star size={56} fill="currentColor" /></span>)}
          </p>
          <h1><FitText className="jaw-result-title" text={text.wellDone} /></h1>
          <div className="jaw-result-record" data-celebrating={result.celebration || undefined}>
            <Tooth />
            {result.celebration && <CelebrationChip language={language} celebration={result.celebration} />}
            <BestScore language={language} best={result.best} beaten={result.beaten} total={3} />
          </div>
          {discoveries.length > 0 && <section className="jaw-result-collection" aria-label={text.jawCollection}>
            <p role="status"><Sparkles aria-hidden="true" /><FitText className="jaw-result-new-label" text={text.jawNewCollection} /></p>
            <div className="jaw-result-shelf" aria-label={text.jawShelf}>
              {discoveries.map(({ id, name, picture }, index) => <div className="jaw-result-find" key={id} style={motion({ "--jaw": index })}>
                <Picture className="jaw-result-new-picture" src={picture} alt={name[language].toLocaleUpperCase(language)} width={600} height={450} />
              </div>)}
            </div>
          </section>}
        </div>
      </div>
      <nav className="jaw-result-actions">
        <Button className="jaw-result-play" disabled={blocked} onClick={onPlayAgain}><RotateCcw aria-hidden="true" /><FitText className="jaw-result-action-word" text={text.playAgain} /></Button>
        <Button className="jaw-result-visit" disabled={blocked} onClick={onShelf}><LibraryBig aria-hidden="true" /><FitText className="jaw-result-action-word" text={text.jawShelf} /></Button>
        <Button className="jaw-result-home" disabled={blocked} onClick={onHome}><House aria-hidden="true" /><FitText className="jaw-result-action-word" text={text.home} /></Button>
      </nav>
    </main>
    {shown && blocked && <LevelOfferDialog controls={audioControl} language={language} offer={shown} leaving={phase === "leaving"} onShown={shown.onShown}
      onAnswer={(answer) => { setPhase("leaving"); if (answer === "yes") shown.onYes(); else shown.onNotNow(); }} onGone={() => setPhase("gone")} />}
  </>;
}
