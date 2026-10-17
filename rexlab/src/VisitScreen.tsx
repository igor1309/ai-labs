import { Bath, Check, Droplet, Footprints, Heart, House, Moon, Undo2, Utensils, type LucideIcon } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";
import { usePointerState } from "./usePointerState.ts";

export type CareItem = keyof Texts["items"];
export type CareNeed = keyof Texts["needs"];
export type NeedState = keyof Texts["needStates"];

// The items on the tray, in the design's order.
export const CARE_ITEMS: readonly CareItem[] = ["plants", "meat", "water", "bath", "nest"];

const NEED_SYMBOLS: Record<CareNeed, LucideIcon> = { hungry: Utensils, thirsty: Droplet, dirty: Bath, tired: Moon };

// The bubbles rising from a bath, and the moons drifting up from a nest:
// how many, and where each starts, as a fraction of the visitor's width.
const RISING = [0.3, 0.45, 0.6, 0.38, 0.52];

export type VisitView = {
  id: string;
  name: string;
  // The URL of the visitor's picture.
  picture: string;
  needs: ReadonlyArray<{ need: CareNeed; state: NeedState }>;
  hearts: number;
  need: CareNeed | undefined;
  // What the bubble pictures: an item, or the empty bowl of hunger.
  bubble: ReadonlyArray<CareItem | "bowl">;
  suggested: readonly CareItem[];
  refused: readonly CareItem[];
  reacting: { item: CareItem; reaction: "happy" | "refusal"; earned: number } | null;
  // Every need is met and the visitor dances away.
  leaving: boolean;
};

export type VisitScreenProps = {
  language: Language;
  visit: VisitView;
  // The URL of each item's picture, and of the empty bowl.
  itemPicture: (item: CareItem | "bowl") => string;
  onGive: (item: CareItem) => void;
  onHome: () => void;
};

export function VisitScreen({ language, visit, itemPicture, onGive, onHome }: VisitScreenProps) {
  const text = TEXTS[language];
  const { id, name, picture, needs, hearts, need, bubble, suggested, refused, reacting, leaving } = visit;
  // The visitor whose picture failed to load: its name then carries a
  // dinosaur symbol in its place, and the visit goes on without it.
  const [missing, setMissing] = useState<string>();
  // Items are taken only while a need is asked, so a tap during a
  // reaction, or once the visitor leaves, gives nothing.
  const busy = need === undefined || reacting !== null;
  return (
    <main className="visit">
      <header className="visit-bar">
        <button type="button" className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </button>
        <ol className="needs" aria-label={text.needsLabel}>
          {needs.map(({ need: each, state }) => {
            const Symbol = state === "met" ? Check : NEED_SYMBOLS[each];
            return (
              <li key={each} className="need" data-need={each} data-state={state} aria-label={`${text.needs[each]}: ${text.needStates[state]}`}>
                <Symbol key={state === "met" ? "met" : "asked"} size={28} aria-hidden="true" />
              </li>
            );
          })}
        </ol>
        <p className="hearts-counter" aria-label={text.hearts}>
          <Heart size={28} aria-hidden="true" />
          {/* A new count bumps in as the hearts earned reach it. */}
          <span key={hearts} className="hearts-count">
            {hearts}
          </span>
        </p>
      </header>
      <section className="stage" data-reaction={reacting?.reaction} data-item={reacting?.item} data-leaving={leaving || undefined}>
        <span className="stage-glow" aria-hidden="true" />
        <span className="stage-ground" aria-hidden="true" />
        <h1 className="visitor-name" aria-label={name}>
          {missing === id && <Footprints className="visitor-missing" size={36} aria-hidden="true" />}
          {name.toLocaleUpperCase(language)}
        </h1>
        {missing !== id && <img key={id} className="visitor" src={picture} alt="" draggable={false} onError={() => setMissing(id)} />}
        {need !== undefined && bubble.length > 0 && (
          // A new bubble grows from its tail, and so does the one showing
          // what to try after a refusal.
          <div key={`${need}-${bubble.join("-")}`} className="need-bubble" data-need={need} role="img" aria-label={bubbleLabel(text, need, suggested)}>
            <span className="bubble-tail bubble-tail-1" />
            <span className="bubble-tail bubble-tail-2" />
            <span className="bubble-art" data-count={bubble.length}>
              {bubble.map((shown) => (
                <img key={shown} className="bubble-picture" data-item={shown} src={itemPicture(shown)} alt="" draggable={false} />
              ))}
              {need === "tired" && (
                <span className="bubble-badge">
                  <Moon size={28} />
                </span>
              )}
            </span>
          </div>
        )}
        {reacting && (
          <span key={`${reacting.item}-${reacting.reaction}`} className="given" data-reaction={reacting.reaction} aria-hidden="true">
            <img className="given-picture" src={itemPicture(reacting.item)} alt="" draggable={false} />
            {reacting.reaction === "refusal" && <Undo2 className="turn-away" size={56} />}
          </span>
        )}
        {reacting?.reaction === "happy" && (
          <>
            <span className="hearts-pop" aria-hidden="true">
              {Array.from({ length: reacting.earned }, (_, at) => (
                <Heart key={at} size={44} fill="currentColor" />
              ))}
              <span className="hearts-pop-count">+{reacting.earned}</span>
            </span>
            {(reacting.item === "bath" || reacting.item === "nest") && (
              <span className="rising" data-item={reacting.item} aria-hidden="true">
                {RISING.map((left, at) => (
                  <span key={at} className="rising-piece" style={{ left: `${left * 100}%`, "--piece": at } as CSSProperties}>
                    {reacting.item === "nest" && <Moon size={24} />}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </section>
      <div className="tray" role="group" aria-label={text.care} data-busy={busy || undefined}>
        {CARE_ITEMS.map((item) => (
          <TrayItem
            key={item}
            item={item}
            label={text.items[item]}
            picture={itemPicture(item)}
            suggested={suggested.includes(item)}
            refused={refused.includes(item)}
            busy={busy}
            onGive={onGive}
          />
        ))}
      </div>
    </main>
  );
}

// What the bubble reads out: the need, and after a refusal what to try.
function bubbleLabel(text: Texts, need: CareNeed, suggested: readonly CareItem[]): string {
  return [text.needs[need], ...suggested.map((item) => text.items[item])].join(", ");
}

type TrayItemProps = {
  item: CareItem;
  label: string;
  picture: string;
  suggested: boolean;
  refused: boolean;
  busy: boolean;
  onGive: (item: CareItem) => void;
};

function TrayItem({ item, label, picture, suggested, refused, busy, onGive }: TrayItemProps) {
  const pointer = usePointerState();
  return (
    <button
      type="button"
      className="card tray-item"
      data-item={item}
      data-suggested={suggested || undefined}
      data-refused={refused || undefined}
      disabled={busy}
      onClick={() => onGive(item)}
      {...pointer}
    >
      <img className="tray-picture" src={picture} alt="" draggable={false} />
      <span className="tray-label">{label}</span>
    </button>
  );
}
