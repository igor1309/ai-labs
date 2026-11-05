import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Check, CircleDot, Home, Images, LogOut, Paintbrush, PaintBucket, Palette, Plus, RotateCcw, Save, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "./Button.tsx";
import { BRUSH_SIZES, COLORS, type Action, type BrushSize, type Color, type Point } from "./coloring/index.ts";
import type { ColoringWorkshopSession, WorkshopDestination } from "./coloringWorkshop.ts";
import type { Language } from "./language/language.ts";
import { EarthEdge } from "./EarthEdge.tsx";
import { InputArbitrationContext } from "./inputArbitration.ts";
import "./coloringWorkshop.css";

// The size class the app root sets on <html>: an upright iPad keeps the
// palette open under the paper instead of behind a COLOR button.
const sizeClass = {
  subscribe(change: () => void) {
    const observer = new MutationObserver(change);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-size"] });
    return () => observer.disconnect();
  },
  get: () => document.documentElement.dataset.size
};

const words = {
  en: { title: "WORKSHOP", home: "HOME", gallery: "GALLERY", new: "NEW WORK", newTile: "NEW", done: "DONE", brush: "BRUSH", fill: "FILL", undo: "UNDO", color: "COLOR", size: "SIZE", close: "CLOSE", saving: "SAVING", saved: "SAVED", error: "COULDN’T SAVE", retry: "RETRY", edit: "KEEP EDITING", leave: "HOME WITHOUT SAVING", loss: "LEAVE AND LOSE CHANGES?", confirm: "LEAVE", cancel: "STAY", colors: ["BASE", "RED", "ORANGE", "YELLOW", "GREEN", "TEAL", "BLUE", "INDIGO", "PURPLE", "PINK", "BROWN", "CHARCOAL"], sizes: ["SMALL", "MEDIUM", "LARGE"] },
  ru: { title: "МАСТЕРСКАЯ", home: "ДОМОЙ", gallery: "ГАЛЕРЕЯ", new: "НОВЫЙ РИСУНОК", newTile: "НОВЫЙ", done: "ГОТОВО", brush: "КИСТЬ", fill: "ЗАЛИВКА", undo: "ОТМЕНИТЬ", color: "ЦВЕТ", size: "РАЗМЕР", close: "ЗАКРЫТЬ", saving: "СОХРАНЯЕМ", saved: "СОХРАНЕНО", error: "НЕ УДАЛОСЬ СОХРАНИТЬ", retry: "ПОВТОРИТЬ", edit: "РИСОВАТЬ ДАЛЬШЕ", leave: "ДОМОЙ БЕЗ СОХРАНЕНИЯ", loss: "УЙТИ И ПОТЕРЯТЬ ИЗМЕНЕНИЯ?", confirm: "УЙТИ", cancel: "ОСТАТЬСЯ", colors: ["ОСНОВА", "КРАСНЫЙ", "ОРАНЖЕВЫЙ", "ЖЁЛТЫЙ", "ЗЕЛЁНЫЙ", "БИРЮЗОВЫЙ", "ГОЛУБОЙ", "СИНИЙ", "ФИОЛЕТОВЫЙ", "РОЗОВЫЙ", "КОРИЧНЕВЫЙ", "УГОЛЬНЫЙ"], sizes: ["МАЛЕНЬКИЙ", "СРЕДНИЙ", "БОЛЬШОЙ"] }
};
type Stroke = Extract<Action, { kind: "stroke" }>;
type Contact = { id: number; action: Omit<Stroke, "points"> & { points: Point[] }; tool: "brush" | "fill"; surface: HTMLCanvasElement };

type WorkshopPainter = {
  width: number;
  height: number;
  render(canvas: HTMLCanvasElement, actions: readonly Action[]): void;
  preview(canvas: HTMLCanvasElement, actions: readonly Action[], active: Stroke): void;
  regionAt(point: Point): string | undefined;
};
export type ColoringWorkshopScreenProps = { session: ColoringWorkshopSession; painter: WorkshopPainter; language: Language; dinosaur?: string | undefined };

export function ColoringWorkshopScreen({ session, painter, language, dinosaur }: ColoringWorkshopScreenProps) {
  const arbitrate = useContext(InputArbitrationContext);
  if (!arbitrate) throw new Error("Coloring workshop requires input arbitration");
  const { width: WIDTH, height: HEIGHT } = painter;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const empty = useMemo(() => session.isEmpty(), [session, state.work]);
  const text = { ...words[language], dinosaur: dinosaur ?? (language === "en" ? "STEGOSAURUS" : "СТЕГОЗАВР") };
  const [color, setColor] = useState<Color>(COLORS[1]);
  const [size, setSize] = useState<BrushSize>(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<"brush" | "fill">("brush");
  const [chooser, setChooser] = useState<"color" | "size" | null>(null);
  const paletteButton = useRef<HTMLButtonElement>(null);
  const previousChooser = useRef<"color" | "size" | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const chooserBox = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<CSSProperties>({});
  const openPalette = useSyncExternalStore(sizeClass.subscribe, sizeClass.get) === "tall";
  const sizeButton = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<Contact | undefined>(undefined);
  const previewFrame = useRef<number | undefined>(undefined);
  const paintRef = useRef(state.work.actions);
  paintRef.current = state.work.actions;
  const blocked = state.frozen || state.errorOpen || state.confirmingLoss;
  const canAct = () => {
    const latest = session.getSnapshot();
    return !active.current && !latest.frozen && !latest.errorOpen && !latest.confirmingLoss;
  };
  const stopPreview = () => {
    if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current);
    previewFrame.current = undefined;
  };
  const cancel = () => {
    stopPreview();
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
    const box = event.currentTarget.getBoundingClientRect();
    const append = (sample: Pick<PointerEvent, "clientX" | "clientY">) => {
      const next = { x: (sample.clientX - box.left) * WIDTH / box.width, y: (sample.clientY - box.top) * HEIGHT / box.height };
      const last = contact.action.points.at(-1)!;
      // Only the live contact owns this buffer; the model copies and freezes it
      // on acceptance, so sampling never copies a growing committed journal.
      if (next.x !== last.x || next.y !== last.y) contact.action.points.push(next);
    };
    for (const sample of samples) append(sample);
    append(event.nativeEvent);
    if (contact.tool === "brush" && previewFrame.current === undefined) {
      previewFrame.current = requestAnimationFrame(() => {
        previewFrame.current = undefined;
        if (active.current === contact) painter.preview(contact.surface, paintRef.current, contact.action);
      });
    }
  };
  const go = (destination: WorkshopDestination) => { if (canAct()) session.go(destination); };
  const closeChooser = () => setChooser(null);
  // A popover stands beside its button on a tablet: level with it beside the
  // rail, under it beneath a bar. A phone's sheet fills the paper instead.
  useLayoutEffect(() => {
    const button = (chooser === "size" ? sizeButton : paletteButton).current, box = chooserBox.current, room = body.current;
    const size = document.documentElement.dataset.size;
    if (!chooser || !button || !box || !room || (size !== "wide" && size !== "tall")) { setAnchor({}); return; }
    const b = button.getBoundingClientRect(), r = room.getBoundingClientRect(), c = box.getBoundingClientRect();
    const clamp = (value: number, most: number) => Math.max(0, Math.min(value, most));
    setAnchor(size === "wide"
      ? { left: 0, top: clamp(b.top + b.height / 2 - c.height / 2 - r.top, r.height - c.height) }
      : { top: 0, left: clamp(b.left + b.width / 2 - c.width / 2 - r.left, r.width - c.width) });
  }, [chooser]);
  const palette = (open = false) => <div className="coloring-palette" role="group" aria-label={text.color}>{COLORS.map((value, i) =>
    <Button key={value} autoFocus={!open && color === value} aria-label={text.colors[i]} aria-pressed={color === value} disabled={blocked} onClick={() => { if (canAct()) { setColor(value); closeChooser(); } }}>
      <span className="coloring-swatch" style={{ background: value }}>{color === value && <Check aria-hidden="true" />}</span><span className="coloring-swatch-name">{text.colors[i]}</span>
    </Button>)}</div>;
  const sizes = () => <div className="coloring-sizes" role="group" aria-label={text.size}>{BRUSH_SIZES.map((value, i) =>
    <Button key={value} autoFocus={size === value} aria-label={`${text.brush} ${text.sizes[i]}`} aria-pressed={tool === "brush" && size === value} disabled={blocked} onClick={() => { if (canAct()) { setSize(value); setTool("brush"); closeChooser(); } }}>
      <span className="coloring-size-face"><span className="coloring-dot" style={{ "--dot": `${value / 2 + 4}px`, color } as CSSProperties} />
      {tool === "brush" && size === value && <Check className="coloring-selection" aria-hidden="true" />}</span><span className="coloring-swatch-name">{text.sizes[i]}</span>
    </Button>)}</div>;
  return <section className="coloring-workshop" lang={language} aria-label={text.title}>
    <div className="coloring-ground" aria-hidden="true"><EarthEdge className="coloring-wave" /><div className="coloring-bedrock"><EarthEdge className="coloring-wave" /></div></div>
    <h1 className="coloring-title">{text.title}</h1>
    <div className="coloring-rail" inert={state.errorOpen || state.confirmingLoss}>
      <nav className="coloring-navigation" aria-label={text.title} inert={chooser !== null}>
        <Button className="coloring-nav-home" aria-label={text.home} onClick={() => go("home")} disabled={blocked}><span className="coloring-face"><Home aria-hidden="true" /></span><span className="coloring-tile-name">{text.home}</span></Button>
        <Button className="coloring-nav-new" aria-label={text.new} onClick={() => go("new")} disabled={blocked}><span className="coloring-face"><Plus aria-hidden="true" /></span><span className="coloring-tile-name">{text.newTile}</span></Button>
        <Button className="coloring-nav-gallery" aria-label={text.gallery} onClick={() => go("gallery")} disabled={blocked}><span className="coloring-face"><Images aria-hidden="true" /></span><span className="coloring-tile-name">{text.gallery}</span></Button>
        <Button className="coloring-done" aria-label={text.done} disabled={blocked || empty} onClick={() => go("result")}><span className="coloring-face"><Check aria-hidden="true" /></span><span className="coloring-tile-name">{text.done}</span></Button>
      </nav>
      <div className="coloring-tools" role="group" aria-label={text.brush} inert={chooser !== null}>
        <Button aria-label={text.brush} aria-pressed={tool === "brush"} disabled={blocked} onClick={() => { if (canAct()) setTool("brush"); }}><span className="coloring-face"><Paintbrush aria-hidden="true" /></span>{tool === "brush" && <Check className="coloring-selection" aria-hidden="true" />}<span className="coloring-tile-name">{text.brush}</span></Button>
        <Button aria-label={text.fill} aria-pressed={tool === "fill"} disabled={blocked} onClick={() => { if (canAct()) setTool("fill"); }}><span className="coloring-face"><PaintBucket aria-hidden="true" /></span>{tool === "fill" && <Check className="coloring-selection" aria-hidden="true" />}<span className="coloring-tile-name">{text.fill}</span></Button>
        {!openPalette && <Button ref={paletteButton} className="coloring-palette-button" aria-label={text.color} aria-haspopup="dialog" aria-expanded={chooser === "color"} disabled={blocked} onClick={() => { if (canAct()) setChooser("color"); }}>
          <span className="coloring-face coloring-face-color" style={{ background: color }}><Palette aria-hidden="true" /></span><span className="coloring-tile-name">{text.color}</span>
        </Button>}
        <Button ref={sizeButton} className="coloring-size-button" aria-label={text.size} aria-haspopup="dialog" aria-expanded={chooser === "size"} disabled={blocked} onClick={() => { if (canAct()) setChooser("size"); }}>
          <span className="coloring-face"><span className="coloring-dot" style={{ "--dot": `${size / 2 + 4}px`, color } as CSSProperties} /></span><span className="coloring-tile-name">{text.size}</span>
        </Button>
        <Button className="coloring-undo" aria-label={text.undo} disabled={blocked || !state.work.actions.length} onClick={() => { if (canAct()) session.undo(); }}><span className="coloring-face"><Undo2 aria-hidden="true" /></span><span className="coloring-tile-name">{text.undo}</span></Button>
      </div>
    </div>
    <div className="coloring-body" ref={body} inert={state.errorOpen || state.confirmingLoss}>
      <div className="coloring-paper">
        <h2 className="coloring-hidden">{text.dinosaur}</h2>
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
            stopPreview();
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
        <p className={`coloring-save${state.save === "error" || state.saveError ? " coloring-save-error" : ""}`} role="status" aria-live="polite" inert={chooser !== null || state.errorOpen || state.confirmingLoss}>
      {state.save !== "untouched" && <>
        {state.save === "error" ? <TriangleAlert aria-hidden="true" /> : state.save === "saved" ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
        {text[state.save === "error" ? "error" : state.save]}
        {state.saveError && state.save !== "error" && <><TriangleAlert aria-hidden="true" /><span>{text.error}</span></>}
        {state.save === "error" && !state.errorOpen && <Button onClick={() => { if (canAct()) void session.retry(); }}><RotateCcw aria-hidden="true" />{text.retry}</Button>}
      </>}
    </p>
      </div>
      {chooser && <div className="coloring-picker-layer">
        <div className="coloring-chooser" ref={chooserBox} style={anchor} data-chooser={chooser} role="dialog" aria-modal="true" aria-label={chooser === "size" ? text.size : text.color} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); closeChooser(); }
          if (event.key !== "Tab") return;
          const buttons = [...event.currentTarget.querySelectorAll("button")];
          const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
          if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus(); }
        }}>
          <div className="coloring-picker-header"><strong>{chooser === "size" ? <CircleDot aria-hidden="true" /> : <Palette aria-hidden="true" />}{chooser === "size" ? text.size : text.color}</strong><Button className="coloring-close" aria-label={text.close} onClick={closeChooser}><span className="coloring-close-pill"><X aria-hidden="true" />{text.close}</span></Button></div>
          {chooser === "size" ? sizes() : palette()}
        </div>
      </div>}
      {openPalette && <div className="coloring-strip" inert={chooser !== null}>{palette(true)}</div>}
    </div>
    {(state.errorOpen || state.confirmingLoss) && <div className="coloring-overlay"><div className="coloring-error" role="alertdialog" aria-modal="true" aria-label={state.confirmingLoss ? text.loss : text.error} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const buttons = [...event.currentTarget.querySelectorAll("button")];
      const edge = event.shiftKey ? buttons[0] : buttons.at(-1);
      if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus(); }
    }}>
      <span className="coloring-error-badge">{state.confirmingLoss ? <LogOut aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}</span><h2>{state.confirmingLoss ? text.loss : text.error}</h2>
      {state.confirmingLoss ? <>
        <Button className="coloring-first" autoFocus onClick={() => session.cancelLoss()}><Paintbrush aria-hidden="true" />{text.cancel}</Button>
        <Button className="coloring-way-out" onClick={() => session.confirmLoss()}><LogOut aria-hidden="true" />{text.confirm}</Button>
      </> : <>
        <Button className="coloring-first" autoFocus onClick={() => void session.retry()}><RotateCcw aria-hidden="true" />{text.retry}</Button>
        <Button className="coloring-second" onClick={() => session.keepEditing()}><Paintbrush aria-hidden="true" />{text.edit}</Button>
        <Button className="coloring-way-out" onClick={() => session.askLoss()}><Home aria-hidden="true" />{text.leave}</Button>
      </>}
    </div></div>}
  </section>;
}
