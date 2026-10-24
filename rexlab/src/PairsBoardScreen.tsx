import { ArrowLeft, ChartNoAxesColumnIncreasing, Copy, Footprints, Hand, House } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { pairsBoardCardWidth, PORTRAIT_BOARD, type BoardSizes } from "./pairsBoardLayout.ts";
import { PictureImage, usePicture } from "./Picture.tsx";

// A card on the board: face down, turned over, or one of a found pair.
export type PairCardView = {
  // The dinosaur's id: both cards of a pair share it, and so a picture
  // that cannot be loaded.
  id: string;
  name: string;
  picture: string;
  // Whether the card shows the dinosaur's picture, its silhouette or its
  // skeleton.
  face: "picture" | "silhouette" | "skeleton";
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
  // Back to the game's welcome screen.
  onBack: () => void;
  onHome: () => void;
  // The width the board stands in upright, one for the window; landscape
  // sizes its cards itself.
  width?: number;
  // The upright board's sizes for the window.
  sizes?: BoardSizes;
};

// A custom property the stylesheet staggers the cards by.
const place = (index: number) => ({ "--card": index }) as CSSProperties;

// The widest a card may be upright, as the custom property the stylesheet
// reads.
const widthStyle = (width: number | undefined, rows: number, sizes: BoardSizes): Record<string, string> => (width === undefined ? {} : { "--card-by-width": `${pairsBoardCardWidth(width, rows, sizes)}px` });

export function PairsBoardScreen({ language, climbLevel, tries, rows, columns, cardFloor, cards, finished, onTurn, onBack, onHome, width, sizes = PORTRAIT_BOARD }: PairsBoardScreenProps) {
  const text = TEXTS[language];
  // Upright, BACK and HOME show their symbols alone and the title its mark
  // alone, each name kept for screen readers.
  return (
    <main className="pairs-board-screen">
      <div className="stratum stratum-1" aria-hidden="true" />
      <header className="pairs-bar">
        <Button className="home-button" onClick={onBack}>
          <ArrowLeft size={24} aria-hidden="true" />
          <span className="upright-hidden">{text.back}</span>
        </Button>
        <Button className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          <span className="upright-hidden">{text.home}</span>
        </Button>
        <h1 className="pairs-bar-title">
          <span className="pairs-bar-mark" aria-hidden="true">
            <Copy size={30} />
          </span>
          <span className="upright-hidden">{text.pairs}</span>
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
          style={{ "--rows": rows, "--columns": columns, "--card-floor": `${cardFloor}px`, ...widthStyle(width, rows, sizes) } as CSSProperties}
        >
          {cards.map((card, index) => (
            <PairCard
              key={index}
              card={card}
              index={index}
              label={card.state === "down" ? text.card(index + 1) : card.name.toLocaleUpperCase(language)}
              onTurn={() => onTurn(index)}
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
  label: string;
  language: Language;
  onTurn: () => void;
};

// A face-down card shows the same footprints as every other. Turned over,
// it shows its picture, silhouette or skeleton; found, a green border and the name.
// A card whose picture cannot be loaded shows a dinosaur symbol and the
// name instead. Each card is a part a turn glides, named by its place.
function PairCard({ card, index, label, language, onTurn }: PairCardProps) {
  const name = card.name.toLocaleUpperCase(language);
  return (
    <Button className="card pair-card" data-turn-part={`pair-card-${index}`} data-state={card.state} data-face={card.face} aria-label={label} style={place(index)} onClick={onTurn}>
      {card.state === "down" ? (
        <span className="pair-card-back" aria-hidden="true">
          <span className="pair-card-back-frame">
            <Footprints size={72} />
          </span>
        </span>
      ) : (
        <span className="pair-card-face" aria-hidden="true">
          <PairCardFace card={card} name={name} />
        </span>
      )}
    </Button>
  );
}

// A card's face: its picture, silhouette or skeleton, and its name once found or
// while its picture is not shown, the name then telling the pair apart
// and fading out as the picture fades in.
function PairCardFace({ card, name }: { card: PairCardProps["card"]; name: string }) {
  const look = usePicture(card.picture);
  return (
    <>
      <span className="pair-card-art">
        <PictureImage look={look} className={card.face === "silhouette" ? "pair-card-picture pair-silhouette" : "pair-card-picture"} src={card.picture} alt="" width={800} height={600} />
      </span>
      {(card.state === "found" || look !== "shown") && (
        <span className="pair-card-name" data-fading={(card.state !== "found" && look === "appearing") || undefined}>
          {name}
        </span>
      )}
    </>
  );
}
