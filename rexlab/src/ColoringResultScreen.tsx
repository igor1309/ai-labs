import { useLayoutEffect, useRef } from "react";
import { Home, Images, Paintbrush, Plus, Star, TriangleAlert, Trophy } from "lucide-react";
import { Button } from "./Button.tsx";
import { CelebrationChip } from "./ResultParts.tsx";
import type { Action, Work } from "./coloring/index.ts";
import type { Completion } from "./coloringWorkshop.ts";
import type { ResultAction } from "./coloringResult.ts";
import type { Language } from "./language/language.ts";
import "./coloringResult.css";

const words = {
  en: { title: "YOUR STEGOSAURUS!", picture: "YOUR PAINTED STEGOSAURUS", earned: "+1 STAR", existing: "YOUR STAR", collection: "COLLECTION", best: "EXPLORER BEST", edit: "EDIT", gallery: "GALLERY", new: "NEW WORK", home: "HOME", error: "COULDN’T OPEN · TRY EDIT AGAIN" },
  ru: { title: "ТВОЙ СТЕГОЗАВР!", picture: "ТВОЙ РАСКРАШЕННЫЙ СТЕГОЗАВР", earned: "+1 ЗВЕЗДА", existing: "ЗВЕЗДА УЖЕ ТВОЯ", collection: "КОЛЛЕКЦИЯ", best: "РЕКОРД ИССЛЕДОВАТЕЛЯ", edit: "ЕЩЁ РИСОВАТЬ", gallery: "ГАЛЕРЕЯ", new: "НОВЫЙ РИСУНОК", home: "ДОМОЙ", error: "НЕ УДАЛОСЬ ОТКРЫТЬ · ПОПРОБУЙ ЕЩЁ" }
};
export type ColoringResultScreenProps = {
  work: Work;
  completion: Completion;
  painter: { width: number; height: number; render(canvas: HTMLCanvasElement, actions: readonly Action[]): void };
  language: Language;
  busy: boolean;
  error: boolean;
  choose(action: ResultAction): void;
};

export function ColoringResultScreen({ work, completion, painter, language, busy, error, choose }: ColoringResultScreenProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = words[language];
  useLayoutEffect(() => { if (canvas.current) painter.render(canvas.current, work.actions); }, [painter, work]);
  return <section className="coloring-result" lang={language} aria-label={text.title} aria-busy={busy}>
    <header className="coloring-result-header">
      <Button disabled={busy} onClick={() => choose("home")}><Home aria-hidden="true" />{text.home}</Button>
      <h1>{text.title}</h1>
    </header>
    <div className="coloring-result-body">
      <div className="coloring-result-paper"><div className="coloring-result-art">
        <canvas ref={canvas} width={painter.width} height={painter.height} role="img" aria-label={text.picture} />
      </div>
        {error && <p className="coloring-result-error" role="alert"><TriangleAlert aria-hidden="true" />{text.error}</p>}
      </div>
      <div className="coloring-result-reward">
        <p className="coloring-result-star" role="status">
          <Star aria-hidden="true" fill="currentColor" /><span>{completion.earned ? text.earned : text.existing}</span>
        </p>
        <p className={`coloring-result-count${completion.earned ? " coloring-result-earned" : ""}`} aria-label={text.collection}><Star aria-hidden="true" />{text.collection}: <strong>{completion.completedCount}</strong></p>
        <div className="coloring-result-best">
          {completion.earned && <CelebrationChip language={language} celebration={completion.completedCount === 1 ? "first-best" : "new-best"} />}
          <p><Trophy aria-hidden="true" />{text.best}: <strong>{completion.completedCount}</strong></p>
        </div>
        <nav className="coloring-result-actions" aria-label={text.title}>
          <Button className="coloring-result-edit" disabled={busy} onClick={() => choose("edit")}><Paintbrush aria-hidden="true" />{text.edit}</Button>
          <Button disabled={busy} onClick={() => choose("gallery")}><Images aria-hidden="true" />{text.gallery}</Button>
          <Button disabled={busy} onClick={() => choose("new")}><Plus aria-hidden="true" />{text.new}</Button>
        </nav>
      </div>
    </div>
  </section>;
}
