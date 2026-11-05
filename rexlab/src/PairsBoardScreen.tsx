import { ArrowLeft, Footprints, Hand, House } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import { EarthEdge } from "./EarthEdge.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { pairsBoardCardWidth, PORTRAIT_BOARD, type BoardSizes } from "./pairsBoardLayout.ts";
import { CardsFill, Stairs } from "./PairsIcons.tsx";
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
  // The dig site: the bar in the sky, the board on the sand, the bedrock
  // along the bottom. Where a size has no room for them, BACK and HOME
  // show their symbols alone and the title its mark alone, each name kept
  // for screen readers.
  return (
    <main className="pairs-board-screen">
      <header className="pairs-bar">
        <div className="pairs-bar-buttons">
          <Button className="home-button pairs-bar-button pairs-bar-home" onClick={onHome}>
            <House aria-hidden="true" />
            <span className="pairs-bar-name">{text.home}</span>
          </Button>
          <Button className="home-button pairs-bar-button pairs-bar-back" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            <span className="pairs-bar-name">{text.back}</span>
          </Button>
        </div>
        <h1 className="pairs-bar-title">
          <span className="pairs-bar-mark" aria-hidden="true">
            <CardsFill />
          </span>
          <span className="pairs-bar-word">{text.pairs}</span>
        </h1>
        <div className="pairs-bar-chips">
          {climbLevel !== undefined && (
            <p className="pairs-bar-chip" aria-label={text.level}>
              <Stairs className="pairs-stairs" />
              <span className="pairs-bar-number">{climbLevel}</span>
            </p>
          )}
          <p className="pairs-bar-chip" aria-label={text.tries}>
            <Hand aria-hidden="true" />
            {/* A new count bumps in. */}
            <span key={tries} className="pairs-bar-number pairs-tries">
              {tries}
            </span>
          </p>
        </div>
      </header>
      <section className="pairs-board-sand">
        <EarthEdge className="pairs-board-wave" />
      <div className="pair-board-room">
        <div
          className="pair-board"
          role="group"
          aria-label={text.cards}
          data-finished={finished || undefined}
          data-cards={cards.length}
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
      </section>
      <div className="pairs-board-bedrock" aria-hidden="true"><EarthEdge /></div>
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
          <Footprints />
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
// and fading out as the picture fades in. A found card's name under its
// loaded picture is a caption, which a phone leaves to the card's label.
function PairCardFace({ card, name }: { card: PairCardProps["card"]; name: string }) {
  const look = usePicture(card.picture);
  return (
    <>
      <span className="pair-card-art">
        <PictureImage look={look} className={card.face === "silhouette" ? "pair-card-picture pair-silhouette" : "pair-card-picture"} src={card.picture} alt="" width={800} height={600} />
        {/* A silhouette is the picture's shape in ink. */}
        {card.face === "silhouette" && <span className="pair-card-shadow" style={{ maskImage: `url("${card.picture}")` }} />}
      </span>
      {(card.state === "found" || look !== "shown") && (
        <span className="pair-card-name" data-fading={(card.state !== "found" && look === "appearing") || undefined}
          data-caption={(card.state === "found" && (look === "appearing" || look === "shown")) || undefined}>
          {name}
        </span>
      )}
    </>
  );
}
