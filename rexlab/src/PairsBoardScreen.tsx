import { ChartNoAxesColumnIncreasing, Copy, Footprints, Hand, House } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { usePointerState } from "./usePointerState.ts";

// A card on the board: face down, turned over, or one of a found pair.
export type PairCardView = {
  // The dinosaur's id: both cards of a pair share it, and so a picture
  // that cannot be loaded.
  id: string;
  name: string;
  picture: string;
  // Whether the card shows the dinosaur's picture or its silhouette.
  face: "picture" | "silhouette";
  state: "down" | "open" | "found";
};

export type PairsBoardScreenProps = {
  language: Language;
  // The climb level of a Hatchling board; a larger level's board has none.
  climbLevel: number | undefined;
  tries: number;
  rows: number;
  columns: number;
  // The smallest a card may be, in CSS pixels.
  cardFloor: number;
  // The cards in their places, row by row.
  cards: readonly PairCardView[];
  // The last pair is found: every card waves before the result.
  finished: boolean;
  onTurn: (place: number) => void;
  onHome: () => void;
};

// A custom property the stylesheet staggers the cards by.
const place = (index: number) => ({ "--card": index }) as CSSProperties;

export function PairsBoardScreen({ language, climbLevel, tries, rows, columns, cardFloor, cards, finished, onTurn, onHome }: PairsBoardScreenProps) {
  const text = TEXTS[language];
  // The dinosaurs whose picture cannot be loaded: both their cards show a
  // dinosaur symbol and the name instead.
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  return (
    <main className="pairs-board-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <header className="pairs-bar">
        <button type="button" className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </button>
        <h1 className="pairs-bar-title">
          <span className="pairs-bar-mark" aria-hidden="true">
            <Copy size={30} />
          </span>
          {text.pairs}
        </h1>
        {climbLevel !== undefined && (
          <p className="pairs-bar-chip" aria-label={text.level}>
            <ChartNoAxesColumnIncreasing size={26} aria-hidden="true" />
            {climbLevel}
          </p>
        )}
        <p className="pairs-bar-chip" aria-label={text.tries}>
          <Hand size={26} aria-hidden="true" />
          {/* A new count bumps in. */}
          <span key={tries} className="pairs-tries">
            {tries}
          </span>
        </p>
      </header>
      <div className="pair-board-room">
        <div
          className="pair-board"
          role="group"
          aria-label={text.cards}
          data-finished={finished || undefined}
          style={{ "--rows": rows, "--columns": columns, "--card-floor": `${cardFloor}px` } as CSSProperties}
        >
          {cards.map((card, index) => (
            <PairCard
              key={index}
              card={card}
              index={index}
              missing={missing.has(card.id)}
              label={card.state === "down" ? text.card(index + 1) : card.name.toLocaleUpperCase(language)}
              onTurn={() => onTurn(index)}
              onMissing={() => setMissing((known) => new Set([...known, card.id]))}
              language={language}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

type PairCardProps = {
  card: PairCardView;
  index: number;
  missing: boolean;
  label: string;
  language: Language;
  onTurn: () => void;
  onMissing: () => void;
};

// A face-down card shows the same footprints as every other. Turned over,
// it shows its picture or silhouette; found, a green border and the name.
// A card whose picture cannot be loaded shows a dinosaur symbol and the
// name instead.
function PairCard({ card, index, missing, label, language, onTurn, onMissing }: PairCardProps) {
  const pointer = usePointerState();
  const name = card.name.toLocaleUpperCase(language);
  return (
    <button type="button" className="card pair-card" data-state={card.state} data-face={card.face} aria-label={label} style={place(index)} onClick={onTurn} {...pointer}>
      {card.state === "down" ? (
        <span className="pair-card-back" aria-hidden="true">
          <span className="pair-card-back-frame">
            <Footprints size={72} />
          </span>
        </span>
      ) : (
        <span className="pair-card-face" aria-hidden="true">
          <span className="pair-card-art">
            {missing ? (
              <Footprints className="pair-card-missing" size={56} />
            ) : (
              <img
                className={card.face === "silhouette" ? "pair-card-picture pair-silhouette" : "pair-card-picture"}
                src={card.picture}
                alt=""
                draggable={false}
                onError={onMissing}
              />
            )}
          </span>
          {(card.state === "found" || missing) && <span className="pair-card-name">{name}</span>}
        </span>
      )}
    </button>
  );
}
