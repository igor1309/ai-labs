import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Check, Home, Images, Paintbrush, PaintBucket, Palette, Plus, RotateCcw, Save, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "./Button.tsx";
import { BRUSH_SIZES, COLORS, type Action, type BrushSize, type Color, type Point } from "./coloring/index.ts";
import type { ColoringWorkshopSession, WorkshopDestination } from "./coloringWorkshop.ts";
import type { Language } from "./language/language.ts";
import { InputArbitrationContext } from "./inputArbitration.ts";
import "./coloringWorkshop.css";

const words = {
  en: { title: "WORKSHOP", dinosaur: "STEGOSAURUS", home: "HOME", gallery: "GALLERY", new: "NEW WORK", done: "DONE", brush: "BRUSH", fill: "FILL", undo: "UNDO", color: "COLOR", size: "SIZE", close: "CLOSE", saving: "SAVING", saved: "SAVED", untouched: "LET’S PAINT!", error: "COULDN’T SAVE", retry: "RETRY", edit: "KEEP EDITING", leave: "HOME WITHOUT SAVING", loss: "LEAVE AND LOSE CHANGES?", confirm: "LEAVE", cancel: "STAY", colors: ["BASE", "RED", "ORANGE", "YELLOW", "GREEN", "TEAL", "BLUE", "INDIGO", "PURPLE", "PINK", "BROWN", "CHARCOAL"], sizes: ["SMALL", "MEDIUM", "LARGE"] },
  ru: { title: "МАСТЕРСКАЯ", dinosaur: "СТЕГОЗАВР", home: "ДОМОЙ", gallery: "ГАЛЕРЕЯ", new: "НОВЫЙ РИСУНОК", done: "ГОТОВО", brush: "КИСТЬ", fill: "ЗАЛИВКА", undo: "ОТМЕНИТЬ", color: "ЦВЕТ", size: "РАЗМЕР", close: "ЗАКРЫТЬ", saving: "СОХРАНЯЕМ", saved: "СОХРАНЕНО", untouched: "ДАВАЙ РИСОВАТЬ!", error: "НЕ УДАЛОСЬ СОХРАНИТЬ", retry: "ПОВТОРИТЬ", edit: "РИСОВАТЬ ДАЛЬШЕ", leave: "ДОМОЙ БЕЗ СОХРАНЕНИЯ", loss: "УЙТИ И ПОТЕРЯТЬ ИЗМЕНЕНИЯ?", confirm: "УЙТИ", cancel: "ОСТАТЬСЯ", colors: ["ОСНОВА", "КРАСНЫЙ", "ОРАНЖЕВЫЙ", "ЖЁЛТЫЙ", "ЗЕЛЁНЫЙ", "БИРЮЗОВЫЙ", "ГОЛУБОЙ", "СИНИЙ", "ФИОЛЕТОВЫЙ", "РОЗОВЫЙ", "КОРИЧНЕВЫЙ", "УГОЛЬНЫЙ"], sizes: ["МАЛЕНЬКИЙ", "СРЕДНИЙ", "БОЛЬШОЙ"] }
};
type Stroke = Extract<Action, { kind: "stroke" }>;
type Contact = { id: number; action: Stroke; tool: "brush" | "fill"; surface: HTMLCanvasElement };

type WorkshopPainter = {
  width: number;
  height: number;
  render(canvas: HTMLCanvasElement, actions: readonly Action[]): void;
  preview(canvas: HTMLCanvasElement, actions: readonly Action[], active: Stroke): void;
  regionAt(point: Point): string | undefined;
};
export type ColoringWorkshopScreenProps = { session: ColoringWorkshopSession; painter: WorkshopPainter; language: Language };

export function ColoringWorkshopScreen({ session, painter, language }: ColoringWorkshopScreenProps) {
  const arbitrate = useContext(InputArbitrationContext);
  if (!arbitrate) throw new Error("Coloring workshop requires input arbitration");
  const { width: WIDTH, height: HEIGHT } = painter;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const empty = useMemo(() => session.isEmpty(), [session, state.work]);
  const text = words[language];
  const [color, setColor] = useState<Color>(COLORS[1]);
  const [size, setSize] = useState<BrushSize>(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<"brush" | "fill">("brush");
  const [chooser, setChooser] = useState<"color" | "size" | null>(null);
  const paletteButton = useRef<HTMLButtonElement>(null);
  const previousChooser = useRef<"color" | "size" | null>(null);
  const sizeButton = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<Contact | undefined>(undefined);
  const paintRef = useRef(state.work.actions);
  paintRef.current = state.work.actions;
  const blocked = state.frozen || state.errorOpen || state.confirmingLoss;
  const canAct = () => {
    const latest = session.getSnapshot();
    return !active.current && !latest.frozen && !latest.errorOpen && !latest.confirmingLoss;
  };
  const cancel = () => {
    const contact = active.current;
    active.current = undefined;
    if (contact) {
      if (contact.surface.hasPointerCapture?.(contact.id)) contact.surface.releasePointerCapture(contact.id);
      painter.render(contact.surface, paintRef.current);
    }
  };
  useLayoutEffect(() => {
    if (blocked) { cancel(); setChooser(null); }
    if (canvas.current) painter.render(canvas.current, state.work.actions);
  }, [painter, state.work, blocked]);
  useLayoutEffect(() => {
    if (!chooser && previousChooser.current) (previousChooser.current === "size" ? sizeButton : paletteButton).current?.focus();
    previousChooser.current = chooser;
  }, [chooser]);
  useEffect(() => {
    // Keep ignored contacts ignored through their release/click even if the
    // drawing finger has already lifted. Keyboard controls are blocked too.
    const ignored = new Set<number>();
    let ignoreMouseClick = false;
    const guard = (event: Event) => {
      const pointer = event as PointerEvent;
      if (event.type === "pointerdown") {
        ignoreMouseClick = false;
        ignored.delete(pointer.pointerId);
        if (active.current && pointer.pointerId !== active.current.id) ignored.add(pointer.pointerId);
      }
      if (event.type === "pointerup" && ignored.has(pointer.pointerId)) ignoreMouseClick = true;
      const legacyClick = event.type === "click" && !("pointerId" in event) && (event as MouseEvent).detail > 0 && ignoreMouseClick;
      if ((active.current && event.type === "click") || ignored.has(pointer.pointerId) || legacyClick) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
      if (event.type === "click") ignoreMouseClick = false;
    };
    const interrupted = () => { cancel(); setChooser(null); };
    const hidden = () => { if (document.visibilityState !== "visible") cancel(); };
    const stopGuard = arbitrate(guard);
    window.addEventListener("resize", interrupted);
    window.addEventListener("orientationchange", interrupted);
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancel();
      stopGuard();
      window.removeEventListener("resize", interrupted);
      window.removeEventListener("orientationchange", interrupted);
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [arbitrate, painter, session]);
  useEffect(() => {
    if (state.save !== "saving" && state.save !== "error") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.save]);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) * WIDTH / box.width, y: (event.clientY - box.top) * HEIGHT / box.height };
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const contact = active.current;
    if (!contact || contact.id !== event.pointerId) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of [...samples, event.nativeEvent]) {
      const box = event.currentTarget.getBoundingClientRect();
      const next = { x: (sample.clientX - box.left) * WIDTH / box.width, y: (sample.clientY - box.top) * HEIGHT / box.height };
      const last = contact.action.points.at(-1)!;
      if (next.x !== last.x || next.y !== last.y) contact.action = { ...contact.action, points: [...contact.action.points, next] };
    }
    if (contact.tool === "brush" && canvas.current) painter.preview(canvas.current, paintRef.current, contact.action);
  };
  const go = (destination: WorkshopDestination) => { if (canAct()) session.go(destination); };
  const closeChooser = () => setChooser(null);
  const palette = (popup = false) => <div className="coloring-palette" role="group" aria-label={text.color}>{COLORS.map((value, i) =>
    <Button key={value} autoFocus={popup && color === value} aria-label={text.colors[i]} aria-pressed={color === value} disabled={blocked} onClick={() => { if (canAct()) { setColor(value); if (popup) closeChooser(); } }}>
      <span className="coloring-swatch" style={{ background: value }}>{color === value && <Check aria-hidden="true" size={22} />}</span>
    </Button>)}</div>;
  const sizes = (popup = false) => <div className="coloring-sizes" role="group" aria-label={text.size}>{BRUSH_SIZES.map((value, i) =>
    <Button key={value} autoFocus={popup && size === value} aria-label={`${text.brush} ${text.sizes[i]}`} aria-pressed={tool === "brush" && size === value} disabled={blocked} onClick={() => { if (canAct()) { setSize(value); setTool("brush"); if (popup) closeChooser(); } }}>
      <span className="coloring-dot" style={{ "--dot": `${value / 2 + 4}px` } as CSSProperties} />
      {tool === "brush" && size === value && <Check className="coloring-selection" aria-hidden="true" />}
    </Button>)}</div>;
  return <section className="coloring-workshop" lang={language} aria-label={text.title}>
    <header className="coloring-header" inert={chooser !== null || state.errorOpen || state.confirmingLoss}>
      <Button onClick={() => go("home")} disabled={blocked}><Home aria-hidden="true" /><span>{text.home}</span></Button>
      <h1><Paintbrush aria-hidden="true" />{text.title}</h1>
      <Button className="coloring-done" disabled={blocked || empty} onClick={() => go("result")}><Check aria-hidden="true" />{text.done}</Button>
    </header>
    <nav className="coloring-navigation" aria-label={text.title} inert={chooser !== null || state.errorOpen || state.confirmingLoss}>
      <Button onClick={() => go("gallery")} disabled={blocked}><Images aria-hidden="true" />{text.gallery}</Button>
      <Button onClick={() => go("new")} disabled={blocked}><Plus aria-hidden="true" />{text.new}</Button>
    </nav>
    <div className="coloring-body" inert={state.errorOpen || state.confirmingLoss}>
      <div className="coloring-paper">
        <h2>{text.dinosaur}</h2>
        <div className="coloring-canvas-space" inert={chooser !== null}><canvas ref={canvas} width={WIDTH} height={HEIGHT} role="img" aria-label={text.dinosaur}
          onContextMenu={event => event.preventDefault()}
          onPointerDown={event => {
            if (chooser || !canAct() || event.button !== 0) return;
            event.preventDefault();
            active.current = { id: event.pointerId, tool, surface: event.currentTarget, action: { kind: "stroke", color, size, points: [point(event)] } };
            event.currentTarget.setPointerCapture(event.pointerId);
            if (tool === "brush") painter.preview(event.currentTarget, state.work.actions, active.current.action);
          }}
          onPointerMove={move}
          onPointerUp={event => {
            const contact = active.current;
            if (!contact || contact.id !== event.pointerId) return;
            move(event);
            active.current = undefined;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (contact.tool === "brush") session.append(contact.action);
            else {
              const region = painter.regionAt(point(event));
              if (region) session.append({ kind: "fill", color: contact.action.color, region });
            }
            painter.render(event.currentTarget, session.getSnapshot().work.actions);
          }}
          onPointerCancel={event => { if (active.current?.id === event.pointerId) cancel(); }}
          onLostPointerCapture={event => { if (active.current?.id === event.pointerId) cancel(); }}
        /></div>
      </div>
      <div className="coloring-tools" role="group" aria-label={text.brush} inert={chooser !== null}>
        <div className="coloring-full-palette">{palette()}</div>
        <Button ref={paletteButton} className="coloring-palette-button" aria-label={text.color} aria-haspopup="dialog" aria-expanded={chooser === "color"} disabled={blocked} onClick={() => { if (canAct()) setChooser("color"); }}>
          <span className="coloring-swatch" style={{ background: color }}><Palette aria-hidden="true" /></span>
        </Button>
        <div className="coloring-inline-sizes">{sizes()}</div>
        <Button ref={sizeButton} className="coloring-size-button" aria-label={text.size} aria-haspopup="dialog" aria-expanded={chooser === "size"} disabled={blocked} onClick={() => { if (canAct()) setChooser("size"); }}>
          <span className="coloring-dot" style={{ "--dot": `${size / 2 + 4}px` } as CSSProperties} />
        </Button>
        <Button aria-label={text.fill} aria-pressed={tool === "fill"} disabled={blocked} onClick={() => { if (canAct()) setTool("fill"); }}><PaintBucket aria-hidden="true" />{tool === "fill" && <Check className="coloring-selection" aria-hidden="true" />}</Button>
        <Button aria-label={text.undo} disabled={blocked || !state.work.actions.length} onClick={() => { if (canAct()) session.undo(); }}><Undo2 aria-hidden="true" /></Button>
      </div>
      {chooser && <div className="coloring-picker-layer">
        <div className="coloring-chooser" role="dialog" aria-modal="true" aria-label={chooser === "size" ? text.size : text.color} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); closeChooser(); }
          if (event.key !== "Tab") return;
          const buttons = [...event.currentTarget.querySelectorAll("button")];
          const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
          if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus(); }
        }}>
          <div className="coloring-picker-header"><strong>{chooser === "size" ? text.size : text.color}</strong><Button aria-label={text.close} onClick={closeChooser}><X aria-hidden="true" /></Button></div>
          {chooser === "size" ? sizes(true) : palette(true)}
        </div>
      </div>}
    </div>
    <p className="coloring-save" role="status" aria-live="polite" inert={chooser !== null || state.errorOpen || state.confirmingLoss}>
      {state.save === "error" ? <TriangleAlert aria-hidden="true" /> : state.save === "saved" ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
      {text[state.save === "error" ? "error" : state.save]}
      {state.saveError && state.save !== "error" && <><TriangleAlert aria-hidden="true" /><span>{text.error}</span></>}
      {state.save === "error" && !state.errorOpen && <Button onClick={() => { if (canAct()) void session.retry(); }}><RotateCcw aria-hidden="true" />{text.retry}</Button>}
    </p>
    {(state.errorOpen || state.confirmingLoss) && <div className="coloring-overlay"><div className="coloring-error" role="alertdialog" aria-modal="true" aria-label={state.confirmingLoss ? text.loss : text.error} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = [...event.currentTarget.querySelectorAll("button")];
      const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
      if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus(); }
    }}>
      <TriangleAlert aria-hidden="true" size={36} /><h2>{state.confirmingLoss ? text.loss : text.error}</h2>
      {state.confirmingLoss ? <>
        <Button autoFocus onClick={() => session.cancelLoss()}><ArrowLeft aria-hidden="true" />{text.cancel}</Button>
        <Button onClick={() => session.confirmLoss()}><Home aria-hidden="true" />{text.confirm}</Button>
      </> : <>
        <Button autoFocus onClick={() => void session.retry()}><RotateCcw aria-hidden="true" />{text.retry}</Button>
        <Button onClick={() => session.keepEditing()}><Paintbrush aria-hidden="true" />{text.edit}</Button>
        <Button onClick={() => session.askLoss()}><Home aria-hidden="true" />{text.leave}</Button>
      </>}
    </div></div>}
  </section>;
}
