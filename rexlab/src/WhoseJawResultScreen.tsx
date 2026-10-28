import { House, Landmark, RotateCcw, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button.tsx";
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
  language: Language;
  result: JawResult;
  offer?: LevelOfferProps | undefined;
  onPlayAgain(): void;
  onShelf(): void;
  onHome(): void;
};

export function WhoseJawResultScreen({ language, result, offer, onPlayAgain, onShelf, onHome }: WhoseJawResultScreenProps) {
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
      {(result.celebration || discoveries.length > 0) && <Festivity />}
      <h1><span aria-hidden="true">🦷</span> {text.wellDone}</h1>
      <p className="result-stars" role="img" aria-label={text.stars(result.stars, 3)}>
        {[0, 1, 2].map((index) => <span key={index} className={`star ${index < result.stars ? "star-won" : "star-empty"}`}
          style={motion({ "--star": index })} aria-hidden="true"><Star size={56} fill="currentColor" /></span>)}
      </p>
      <div className="jaw-result-record">
        {result.celebration && <CelebrationChip language={language} celebration={result.celebration} />}
        <BestScore language={language} best={result.best} beaten={result.beaten} total={3} />
      </div>
      <ul className="jaw-result-jaws" aria-label={text.jawProgress}>
        {result.jaws.map(({ id, name, picture }, index) => <li key={id} style={motion({ "--jaw": index })}>
          <Picture className="jaw-result-picture" src={picture} alt={name[language].toLocaleUpperCase(language)} width={600} height={450} />
        </li>)}
      </ul>
      {discoveries.length > 0 && <section className="jaw-result-collection" aria-label={text.jawCollection}>
        <p role="status"><Sparkles aria-hidden="true" />{text.jawNewCollection}</p>
        <div className="jaw-result-shelf" aria-label={text.jawShelf}>
          {discoveries.map(({ id, name, picture }, index) => <div className="jaw-result-find" key={id} style={motion({ "--jaw": index })}>
            <Picture className="jaw-result-new-picture" src={picture} alt={name[language].toLocaleUpperCase(language)} width={600} height={450} />
          </div>)}
        </div>
      </section>}
      <nav className="jaw-result-actions">
        <Button disabled={blocked} onClick={onPlayAgain}><RotateCcw aria-hidden="true" />{text.playAgain}</Button>
        <Button disabled={blocked} onClick={onShelf}><Landmark aria-hidden="true" />{text.jawShelf}</Button>
        <Button disabled={blocked} onClick={onHome}><House aria-hidden="true" />{text.home}</Button>
      </nav>
    </main>
    {shown && blocked && <LevelOfferDialog language={language} offer={shown} leaving={phase === "leaving"} onShown={shown.onShown}
      onAnswer={(answer) => { setPhase("leaving"); if (answer === "yes") shown.onYes(); else shown.onNotNow(); }} onGone={() => setPhase("gone")} />}
  </>;
}
