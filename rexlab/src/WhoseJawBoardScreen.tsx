import { ArrowLeft, House } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Button } from "./Button.tsx";
import { useGateShown } from "./OrientationGate.tsx";
import { Picture, PictureImage, usePicture } from "./Picture.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

export type JawChoiceView = {
  id: string; name: string; picture: string; food: string; diet: "meat" | "plants";
  mouth: { x: number; y: number; width: number; mirror: boolean; angle: number };
};
export type WhoseJawBoardScreenProps = {
  language: Language;
  phase: "entering" | "waiting" | "right" | "wrong" | "done";
  choices: readonly JawChoiceView[];
  jawPicture: string;
  placed: readonly { firstTry: boolean }[];
  target: string | undefined;
  hint: string | undefined;
  jawDiet: "meat" | "plants";
  foodShown: boolean;
  namesShown: boolean;
  feedback: { words: string; symbol: string } | undefined;
  onPlace(id: string): void;
  onName(id: string): void;
  onSlide(): void;
  onBack(): void;
  onHome(): void;
};
type Hold = { pointerId: number; x: number; y: number; dx: number; dy: number; dragging: boolean };
type Returned = { x: number; y: number; count: number };

export function WhoseJawBoardScreen({ language, phase, choices, jawPicture, placed, target, hint, jawDiet, foodShown, namesShown, feedback, onPlace, onName, onSlide, onBack, onHome }: WhoseJawBoardScreenProps) {
  const text = TEXTS[language];
  const gate = useGateShown();
  const [picked, setPicked] = useState(false);
  const selected = useRef(false);
  const pick = (value: boolean) => { selected.current = value; setPicked(value); };
  const [held, setHeld] = useState<Hold>();
  const [over, setOver] = useState<string>();
  const [back, setBack] = useState<Returned>();
  const [touched, setTouched] = useState(false);
  const hold = useRef<Hold>(undefined);
  const suppressClick = useRef(false);
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const look = usePicture(jawPicture);
  const ready = look === "appearing" || look === "shown";
  const enabled = phase === "waiting" && !gate;
  const locked = useRef(!enabled);
  const holding = picked || !!held?.dragging;
  const updateHold = (next: Hold | undefined) => { hold.current = next; setHeld(next); };
  const cancel = () => { updateHold(undefined); pick(false); setOver(undefined); };

  const place = (id: string) => {
    if (!enabled || locked.current) return;
    locked.current = true;
    cancel();
    onPlace(id);
  };
  const returnHeld = () => {
    const current = hold.current;
    if (current?.dragging) setBack((previous) => ({ x: current.dx, y: current.dy, count: (previous?.count ?? 0) + 1 }));
    cancel();
  };

  useLayoutEffect(() => {
    locked.current = !enabled;
    if (!enabled) cancel();
  }, [enabled]);

  // Expanded zones can overlap on a phone. The nearest centre decides,
  // so a finger in the visible dinosaur always has a predictable target.
  const choiceAt = (x: number, y: number) => [...elements.current].map(([id, element]) => {
    const rect = element.getBoundingClientRect();
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const halfWidth = Math.max(100, rect.width / 2 + 40);
    const halfHeight = Math.max(100, rect.height / 2 + 40);
    return { id, distance: Math.hypot(x - cx, y - cy), inside: Math.abs(x - cx) <= halfWidth && Math.abs(y - cy) <= halfHeight };
  }).filter(({ inside }) => inside).sort((a, b) => a.distance - b.distance)[0]?.id;

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = hold.current;
      if (!enabled || locked.current || !current || event.pointerId !== current.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      const dragging = current.dragging || Math.hypot(dx, dy) > 8;
      updateHold({ ...current, dx, dy, dragging });
      setOver(dragging ? choiceAt(event.clientX, event.clientY) : undefined);
    };
    const end = (event: PointerEvent) => {
      const current = hold.current;
      if (!current || event.pointerId !== current.pointerId) return;
      updateHold(undefined);
      setOver(undefined);
      if (current.dragging || event.type === "pointercancel") pick(false);
      if (event.type === "pointercancel") {
        suppressClick.current = true;
        if (current.dragging) setBack((previous) => ({ x: current.dx, y: current.dy, count: (previous?.count ?? 0) + 1 }));
        return;
      }
      if (!current.dragging) return;
      suppressClick.current = true;
      const destination = enabled ? choiceAt(event.clientX, event.clientY) : undefined;
      if (destination) place(destination);
      else {
        setBack((previous) => ({ x: event.clientX - current.x, y: event.clientY - current.y, count: (previous?.count ?? 0) + 1 }));
        onSlide();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", returnHeld);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", returnHeld);
    };
  }, [enabled, onPlace, onSlide]);

  const keys = (event: KeyboardEvent) => {
    if (!enabled || locked.current || hold.current) return;
    if ((event.key === " " || event.key === "Enter") && (event.target as Element).closest(".jaw-dinosaur, .jaw-loose")) {
      event.preventDefault();
      if (event.repeat) return;
      const id = choices.find(({ id }) => elements.current.get(id) === document.activeElement)?.id;
      if (id) { if (selected.current) place(id); else pick(true); } else pick(!selected.current);
      setTouched(true);
      return;
    }
    if (event.key === "Escape") { cancel(); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const index = choices.findIndex(({ id }) => elements.current.get(id) === document.activeElement);
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = index < 0 ? (direction === 1 ? 0 : choices.length - 1) : (index + direction + choices.length) % choices.length;
    elements.current.get(choices[next]!.id)?.focus();
  };

  return <main className="whose-jaw-board" data-phase={phase} data-holding={holding || undefined} onKeyDown={keys}
    onPointerDownCapture={() => { if (!hold.current) suppressClick.current = false; }}
    onClickCapture={(event) => {
      if (hold.current || (suppressClick.current && event.detail !== 0)) {
        event.preventDefault(); event.stopPropagation();
        if (!hold.current) suppressClick.current = false;
      }
    }} onClick={() => pick(false)}>
    <header className="whose-jaw-board-bar">
      <Button className="home-button" onClick={onHome}><House aria-hidden="true" /><span className="narrow-hidden">{text.home}</span></Button>
      <div className="jaw-teeth" role="img" aria-label={`${text.jawProgress}: ${placed.length} / 5`}>
        {Array.from({ length: 5 }, (_, at) => <span key={at} className="jaw-socket" data-filled={!!placed[at] || undefined}
          data-shining={(placed[at]?.firstTry || phase === "done") || undefined} aria-hidden="true">{placed[at] ? "🦷" : ""}</span>)}
      </div>
      <Button className="home-button" aria-label={text.back} onClick={onBack}><ArrowLeft aria-hidden="true" /></Button>
    </header>
    <h1 className="jaw-board-title"><span aria-hidden="true">🦷</span> {text.whoseJaw}</h1>
    <div className="jaw-choices" role="group" aria-label={text.creatures} style={{ "--choices": choices.length } as CSSProperties}>
      {choices.map((choice, at) => <Button key={choice.id} className="jaw-dinosaur" aria-label={choice.name} aria-disabled={!enabled}
        data-over={over === choice.id || undefined} data-hint={hint === choice.id || undefined}
        data-target={target === choice.id || undefined} style={{ "--place": at } as CSSProperties}
        ref={(element) => { if (element) elements.current.set(choice.id, element); else elements.current.delete(choice.id); }}
        onClick={(event) => { event.stopPropagation(); if (!enabled || locked.current || hold.current) return; if (selected.current) { place(choice.id); } else onName(choice.id); }}>
        <span className="jaw-dinosaur-art" style={{
          "--mouth-x": `${choice.mouth.x}%`, "--mouth-y": `${choice.mouth.y}%`, "--mouth-width": `${choice.mouth.width}%`,
          "--mouth-mirror": choice.mouth.mirror ? -1 : 1, "--mouth-angle": `${choice.mouth.angle}deg`
        } as CSSProperties}>
          <span className="jaw-breath"><Picture className="jaw-gummy" src={choice.picture} alt="" width={800} height={600} />
          <span className="jaw-mouth-glow" aria-hidden="true" />
          {target === choice.id && <span className="jaw-fitted"><Picture className="jaw-fitted-picture" src={jawPicture} alt="" width={600} height={450} /></span>}
          {(foodShown || (target === choice.id && phase === "right")) && <span className="jaw-food"><Picture className="jaw-food-picture" src={choice.food} alt={text.jawFoods[choice.diet]} width={400} height={400} /></span>}
          </span>
        </span>
        {namesShown && <span className="jaw-name">{choice.name}</span>}
      </Button>)}
    </div>
    <div className="jaw-feedback" aria-live="polite">
      {feedback && <p key={`${target}-${phase}`} data-reaction={feedback.symbol}><span aria-hidden="true">{feedback.symbol}</span> {feedback.words}</p>}
    </div>
    <div className="jaw-tray">
      <Button key={back?.count ?? 0} className="jaw-loose" aria-label={text.jawPick} aria-pressed={holding} aria-disabled={!enabled}
        data-dragging={held?.dragging || undefined} data-returning={!!back || undefined} data-inviting={enabled && !touched && ready || undefined}
        style={{ ...(held?.dragging && { translate: `${held.dx}px ${held.dy}px` }), "--from-x": `${back?.x ?? 0}px`, "--from-y": `${back?.y ?? 0}px` } as CSSProperties}
        onPointerDown={(event) => {
          if (!enabled || locked.current || hold.current || event.button !== 0) return;
          setTouched(true);
          updateHold({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, dragging: false });
        }}
        onClick={(event) => { event.stopPropagation(); if (!enabled || locked.current) return; setTouched(true); pick(!selected.current); }}>
        <span className="jaw-loose-art"><PictureImage look={look} className="jaw-loose-picture" src={jawPicture} alt="" width={600} height={450} /></span>
        {hint && foodShown && <span className="jaw-diet-hint" role="img" aria-label={text.jawFoods[jawDiet]}>{jawDiet === "meat" ? "🥩" : "🌿"}</span>}
      </Button>
    </div>
  </main>;
}
