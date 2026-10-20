import { BookOpen, Gem } from "lucide-react";
import type { CSSProperties } from "react";
import { DigBar } from "./DigBar.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";

// A kind of treasure on its card: its picture, and how many of it have
// been found, none for a kind not found yet.
export type FieldGuideCardView = { kind: keyof Texts["treasures"]; picture: string; count: number };

export type DigFieldGuideScreenProps = {
  language: Language;
  // One card for each kind of treasure, in the order the page shows them.
  cards: readonly FieldGuideCardView[];
  onBack: () => void;
  onHome: () => void;
};

// DIG's FIELD GUIDE: the child's collection of the treasures found in the
// sand, a card for each kind, rising in one after the other, under a bar
// with HOME, BACK and the kinds found.
export function DigFieldGuideScreen({ language, cards, onBack, onHome }: DigFieldGuideScreenProps) {
  const text = TEXTS[language];
  const found = cards.filter(({ count }) => count > 0).length;
  return (
    <main className="dig-screen dig-field-guide-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <DigBar language={language} title={text.fieldGuide} Mark={BookOpen} onHome={onHome} onBack={onBack}>
        <p className="dig-chip dig-kinds-found" aria-label={text.kindsFound}>
          <Gem size={20} aria-hidden="true" />
          {found}/{cards.length}
        </p>
      </DigBar>
      <div className="dig-guide-cards" role="group" aria-label={text.treasureCards}>
        {cards.map((card, index) => (
          <GuideCard key={card.kind} language={language} card={card} index={index} />
        ))}
      </div>
    </main>
  );
}

// A kind found shows its picture, its name and how many were found; one
// not found yet shows only a faint outline of its picture and "?", so the
// child sees there is more to find without being told what.
function GuideCard({ language, card, index }: { language: Language; card: FieldGuideCardView; index: number }) {
  const name = TEXTS[language].treasures[card.kind];
  const found = card.count > 0;
  return (
    <section className="dig-guide-card" aria-label={found ? name : "?"} data-kind={card.kind} data-found={found || undefined}
      style={{ "--card": index } as CSSProperties}>
      {found ? (
        <>
          <Picture className="dig-guide-picture" src={card.picture} alt="" width={400} height={400} />
          <h2 className="dig-guide-name">{name}</h2>
          <span className="dig-guide-count">×{card.count}</span>
        </>
      ) : (
        <>
          <span className="dig-guide-outline" aria-hidden="true" style={{ "--outline": `url("${card.picture}")` } as CSSProperties} />
          <span className="dig-guide-unknown" aria-hidden="true">?</span>
        </>
      )}
    </section>
  );
}
