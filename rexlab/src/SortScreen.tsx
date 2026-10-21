import { Check, createLucideIcon, Drumstick, Feather, Footprints, House, Leaf, Shapes, Trophy } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "./Button.tsx";
import { useGateShown } from "./OrientationGate.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { basketLayout } from "./basketLayout.ts";

export type Basket = keyof Texts["baskets"];

// A horn, drawn in the Lucide style: Lucide has none.
const Horn = createLucideIcon("horn", [["path", { d: "M5 20C5 12 11 5 19 3C14 7 11 13 12 20Z", key: "horn" }]]);

// How far a finger moves a card before it is dragged rather than tapped,
// in pixels.
const DRAG_START = 8;

// The most cards the tray lays out in one row; more go in two rows of
// equal length, so eight cards on a 1024-wide screen still read.
const ROW_CARDS = 6;

export type SortCardView = {
  id: string;
  name: string;
  // The URL of the dinosaur's picture.
  picture: string;
  // The card's right basket, once a drop on the other one has missed.
  hint: Basket | undefined;
};

export type SortedCardView = Omit<SortCardView, "hint">;

export type BasketView = {
  basket: Basket;
  // The cards in this basket, in the order they landed.
  cards: readonly SortedCardView[];
};

export type SortScreenProps = {
  language: Language;
  // The tray's places, in order: a card still to sort, or null where a
  // sorted card was, so the other cards never move.
  tray: ReadonlyArray<SortCardView | null>;
  // Two baskets, or three where the level adds one.
  baskets: readonly [BasketView, BasketView] | readonly [BasketView, BasketView, BasketView];
  sorted: number;
  total: number;
  // The right basket of the last wrong drop, which glows for a moment;
  // each wrong drop has its own count, so each one glows anew.
  glow: { basket: Basket; count: number } | undefined;
  onDrop: (id: string, basket: Basket) => void;
  onHome: () => void;
  onSeeResult: () => void;
};

// A card held by a finger, a pen or the mouse, and how far it has moved.
type Hold = { pointerId: number; id: string; x: number; y: number; dx: number; dy: number; dragging: boolean };

// Where a dragged card was let go, from its place, to slide back from.
type Return = { dx: number; dy: number; count: number };

export function SortScreen({ language, tray, baskets, sorted, total, glow, onDrop, onHome, onSeeResult }: SortScreenProps) {
  const gateShown = useGateShown();
  const text = TEXTS[language];
  const [held, setHeld] = useState<Hold>();
  const [picked, setPicked] = useState<string>();
  const [over, setOver] = useState<Basket>();
  const [returns, setReturns] = useState<Record<string, Return>>({});
  // The listeners on the window read the hold as it is now, not as it was
  // when they were added.
  const hold = useRef<Hold>(undefined);
  // A drag has just ended, so the click it ends with is not a tap.
  const dragged = useRef(false);
  const basketElements = useRef(new Map<Basket, HTMLElement>());
  const rows = tray.length > ROW_CARDS ? 2 : 1;

  const holdCard = (next: Hold | undefined) => {
    hold.current = next;
    setHeld(next);
  };

  useLayoutEffect(() => {
    if (!gateShown) return;
    holdCard(undefined);
    setPicked(undefined);
    setOver(undefined);
  }, [gateShown]);

  // A dragged card is over the basket its pointer is over.
  const basketAt = (x: number, y: number) =>
    [...basketElements.current].find(([, element]) => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return x >= left && x <= right && y >= top && y <= bottom;
    })?.[0];

  // Only the pointer that holds a card moves it, so a second finger moves
  // nothing while one card is dragged. A card let go goes back to its
  // place, and only one let go over a basket is dropped on it.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = hold.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      const dragging = current.dragging || Math.hypot(dx, dy) > DRAG_START;
      if (dragging) setPicked(undefined);
      holdCard({ ...current, dx, dy, dragging });
      setOver(dragging ? basketAt(event.clientX, event.clientY) : undefined);
    };
    const end = (event: PointerEvent) => {
      const current = hold.current;
      if (!current || event.pointerId !== current.pointerId) return;
      holdCard(undefined);
      setOver(undefined);
      if (!current.dragging) return;
      dragged.current = true;
      const { id, dx, dy } = current;
      setReturns((all) => ({ ...all, [id]: { dx, dy, count: (all[id]?.count ?? 0) + 1 } }));
      const basket = event.type === "pointerup" ? basketAt(event.clientX, event.clientY) : undefined;
      if (basket) onDrop(id, basket);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [onDrop]);

  const press = (id: string) => (event: ReactPointerEvent) => {
    if (hold.current || event.button !== 0) return;
    dragged.current = false;
    holdCard({ pointerId: event.pointerId, id, x: event.clientX, y: event.clientY, dx: 0, dy: 0, dragging: false });
  };

  // A tap picks a card up, or puts it down again; a tap on a second card
  // while one is dragged does nothing.
  const tapCard = (id: string) => (event: MouseEvent) => {
    event.stopPropagation();
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (hold.current?.dragging) return;
    setPicked((current) => (current === id ? undefined : id));
  };

  // A tap on a basket drops the picked card on it, as if dragged there; a
  // tap on a card already sorted only puts the picked card down.
  const tapBasket = (basket: Basket) => (event: MouseEvent) => {
    event.stopPropagation();
    setPicked(undefined);
    if (picked === undefined || (event.target as Element).closest(".sorted-card")) return;
    onDrop(picked, basket);
  };

  return (
    // A tap anywhere else, such as an empty slot or the space between,
    // puts the picked card down.
    <main className="sort" data-rows={rows} onClick={() => setPicked(undefined)}>
      <div className="stratum stratum-1" aria-hidden="true" />
      <header className="sort-bar">
        <Button className="home-button" onClick={onHome}>
          <House size={24} aria-hidden="true" />
          {text.home}
        </Button>
        {/* One step per card, filled as each lands: no numbers. */}
        <span className="steps" aria-hidden="true">
          {Array.from({ length: total }, (_, at) => (
            <span key={at} className="step" data-step={at < sorted ? "done" : undefined} />
          ))}
        </span>
      </header>
      <h1 className="prompt">
        <span className="prompt-symbol" aria-hidden="true">
          <Shapes size={30} />
        </span>
        {text.sortPrompt}
      </h1>
      <div className="sort-tray-area">
        <div className="sort-tray" role="group" aria-label={text.creatures} style={{ "--columns": Math.ceil(tray.length / rows) } as CSSProperties}>
          {tray.map((card, place) => {
            if (!card) return <span key={`slot-${place}`} className="sort-slot" />;
            const back = returns[card.id];
            const moving = held?.id === card.id && held.dragging ? held : undefined;
            // A card let go is drawn anew where it was let go, so it slides
            // back from there each time.
            return (
              <Button
                key={`${card.id}-${back?.count ?? 0}`}
                className="sort-card"
                aria-label={card.name}
                aria-pressed={picked === card.id}
                data-picked={picked === card.id || undefined}
                data-dragging={moving ? true : undefined}
                data-returning={back ? true : undefined}
                style={
                  {
                    "--slot": place,
                    ...(back && { "--from-x": `${back.dx}px`, "--from-y": `${back.dy}px` }),
                    ...(moving && { translate: `${moving.dx}px ${moving.dy}px` })
                  } as CSSProperties
                }
                onPointerDown={press(card.id)}
                onClick={tapCard(card.id)}
              >
                <span className="sort-art">
                  <Picture className="sort-picture" src={card.picture} alt={card.name} width={800} height={600} />
                  {card.hint && (
                    <span className="sort-hint" data-basket={card.hint} role="img" aria-label={text.baskets[card.hint]}>
                      <BasketSymbol basket={card.hint} size={22} />
                    </span>
                  )}
                </span>
                <span className="sort-footer">
                  <Name name={card.name} language={language} className="sort-name" />
                </span>
              </Button>
            );
          })}
        </div>
        {sorted === total && (
          <Button className="next-button sort-finish" onClick={onSeeResult}>
            <Trophy size={28} aria-hidden="true" />
            {text.seeResult}
          </Button>
        )}
      </div>
      <div className="baskets" data-count={baskets.length}>
        {baskets.map(({ basket, cards }, place) => (
          <Button
            key={basket}
            className="basket"
            aria-label={text.baskets[basket]}
            data-over={over === basket || undefined}
            style={{ "--basket": place } as CSSProperties}
            ref={(element) => {
              if (element) basketElements.current.set(basket, element);
              return () => {
                basketElements.current.delete(basket);
              };
            }}
            onClick={tapBasket(basket)}
          >
            {glow?.basket === basket && <span key={glow.count} className="basket-glow" aria-hidden="true" />}
            <span className="basket-label">
              <span className="basket-mark" data-basket={basket} aria-hidden="true">
                <BasketSymbol basket={basket} size={30} />
              </span>
              <span className="basket-name">{text.baskets[basket]}</span>
            </span>
            <BasketCards cards={cards} language={language} correct={text.marks.correct} />
          </Button>
        ))}
      </div>
    </main>
  );
}

function BasketCards({ cards, language, correct }: { cards: readonly SortedCardView[]; language: Language; correct: string }) {
  const box = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const strips = [...element.querySelectorAll<HTMLElement>(".sorted-footer")];
    const fit = () => {
      const style = getComputedStyle(element);
      const layout = basketLayout({
        width: element.clientWidth,
        height: element.clientHeight,
        count: cards.length,
        gap: Number.parseFloat(style.gap) || 0,
        // The spare pixel covers the DOM's integer layout measurements.
        nameWidth: Math.max(0, ...strips.map((strip) => strip.offsetWidth)) + 1,
        nameHeight: Math.max(0, ...strips.map((strip) => strip.offsetHeight)) + 1,
        pictureAspect: 800 / 600,
        picturePadding: Number.parseFloat(style.getPropertyValue("--named-art-padding")) || 0
      });
      element.style.setProperty("--columns", String(layout.columns));
      for (const card of element.children) card.toggleAttribute("data-name-fits", layout.namesShown);
    };
    fit();
    // The strip keeps its natural size even when hidden, so a font or
    // language change can make the name fit again without a window resize.
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fit);
    observer?.observe(element);
    strips.forEach((strip) => observer?.observe(strip));
    window.addEventListener("resize", fit);
    document.fonts?.addEventListener("loadingdone", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [cards, language]);

  return (
    <span ref={box} className="basket-cards">
      {cards.map((card) => <SortedCard key={card.id} card={card} language={language} correct={correct} />)}
    </span>
  );
}

function SortedCard({ card, language, correct }: { card: SortedCardView; language: Language; correct: string }) {
  return (
    <span className="sorted-card">
      <span className="sorted-art">
        <Picture className="sorted-picture" src={card.picture} alt={card.name} width={800} height={600} />
        <span className="sorted-check" role="img" aria-label={correct}>
          <Check size={20} strokeWidth={3} />
        </span>
      </span>
      <span className="sorted-footer">
        <Name name={card.name} language={language} className="sorted-name" />
      </span>
    </span>
  );
}

// A capitalised name on one line; tray cards budget its width by its
// number of letters, while sorted cards show it only at 14px.
function Name({ name, language, className }: { name: string; language: Language; className: string }) {
  return (
    <span className={className} style={{ "--letters": name.length } as CSSProperties}>
      {name.toLocaleUpperCase(language)}
    </span>
  );
}

// Each basket's symbol, as the design draws it: the number of legs beside
// footprints, a big or a small footprint for size, a horn or a feather
// crossed out for none, and for the third basket a leaf with a drumstick,
// both leg counts, or a feather with a question mark.
function BasketSymbol({ basket, size }: { basket: Basket; size: number }) {
  const cross = <path className="cross" d="m2 2 20 20" />;
  switch (basket) {
    case "two-legs":
    case "four-legs":
      return (
        <>
          <span className="legs-count">{basket === "two-legs" ? 2 : 4}</span>
          <Footprints size={size} />
        </>
      );
    case "plants":
      return <Leaf size={size} />;
    case "meat":
      return <Drumstick size={size} />;
    case "big":
      return <Footprints size={Math.round(size * 1.3)} />;
    case "small":
      return <Footprints size={Math.round(size * 0.6)} />;
    case "horns":
      return <Horn size={size} />;
    case "no-horns":
      return <Horn size={size}>{cross}</Horn>;
    case "feathers":
      return <Feather size={size} />;
    case "no-feathers":
      return <Feather size={size}>{cross}</Feather>;
    case "both":
      return (
        <>
          <Leaf size={Math.round(size * 0.75)} />
          <Drumstick size={Math.round(size * 0.75)} />
        </>
      );
    case "two-or-four":
      return (
        <>
          <span className="legs-count">2 4</span>
          <Footprints size={size} />
        </>
      );
    case "not-known-yet":
      return (
        <>
          <Feather size={size} />
          <span className="mark-question">?</span>
        </>
      );
  }
}
