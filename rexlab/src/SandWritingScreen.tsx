import { Check, Eraser, Home } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { sandWriting, TIP_WIDTHS, type TipWidth } from "./sandWriting.ts";
import { SAND_PALETTE, sandWritingCanvas, type SandPalette } from "./sandWritingCanvas.ts";
import "./sandWriting.css";

// The stick's line in the tray and on STICK, as wide as the tip it draws.
const STROKE = { 2: 2, 4: 3.5, 8: 6 } as const;
function SandStroke({ width }: { width: TipWidth }) {
  return (
    <svg className="sand-writing-stroke" viewBox="0 0 32 20" width={32} height={20} aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={STROKE[width]}>
      <path d="M4 13 C 8 3, 13 3, 16 10 S 24 17, 28 7" />
    </svg>
  );
}

// The marks take the dig site's groove, lip and specks from the screen, in
// either theme; without those tokens, the canvas keeps its own sand.
function sandPalette(screen: Element | null): SandPalette {
  const style = screen && getComputedStyle(screen);
  const token = (name: string) => style?.getPropertyValue(name).trim() ?? "";
  const groove = token("--ds-groove"), lip = token("--ds-groove-lip"), speck = token("--ds-speck");
  return groove && lip && speck ? { bed: null, specks: [speck], every: 40, grain: 2.2, lip, groove } : SAND_PALETTE;
}

export type SandWritingScreenProps = {
  language: Language;
  sandContext: (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null;
  onHome: () => void;
};

export function SandWritingScreen({ language, sandContext, onHome }: SandWritingScreenProps) {
  const text = TEXTS[language];
  const [tip, setTip] = useState<TipWidth>(4);
  const [open, setOpen] = useState<boolean>(false);
  const base = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const section = useRef<HTMLElement>(null);
  const painter = useRef<ReturnType<typeof sandWritingCanvas> | null>(null);
  const model = useRef<ReturnType<typeof sandWriting> | null>(null);
  if (!model.current) model.current = sandWriting((segment) => painter.current?.draw(segment));
  const drawing = model.current;
  const cover = useRef<() => void>(() => {});

  const stop = () => {
    const pointer = drawing.pointer;
    if (pointer === undefined) return;
    drawing.end(pointer);
    if (canvas.current?.hasPointerCapture?.(pointer)) canvas.current.releasePointerCapture(pointer);
  };

  useLayoutEffect(() => {
    const top = canvas.current;
    const bottom = base.current;
    if (!top || !bottom) return;
    const under = sandContext(bottom);
    const over = sandContext(top);
    let palette: SandPalette | undefined;
    painter.current = under && over ? sandWritingCanvas(under, over, () => palette ??= sandPalette(section.current)) : null;
    const fit = () => {
      const { width, height } = top.getBoundingClientRect();
      // Like DIG, the soft sand caps its backing bitmap at Retina density.
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      for (const layer of [bottom, top]) {
        layer.width = Math.round(width * ratio);
        layer.height = Math.round(height * ratio);
      }
      cover.current = () => painter.current?.cover(width, height, ratio);
      cover.current();
      drawing.redraw();
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fit);
    observer?.observe(top);
    window.addEventListener("resize", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
      painter.current = null;
    };
  }, [sandContext, drawing]);

  useEffect(() => () => {
    const pointer = drawing.pointer;
    if (pointer !== undefined) drawing.end(pointer);
  }, [drawing]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) {
        setOpen(false);
        if (panel.current?.contains(document.activeElement)) trigger.current?.focus();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("click", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const point = (event: { clientX: number; clientY: number }) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawing.pointer !== event.pointerId) return;
    event.preventDefault();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    drawing.move(event.pointerId, [...samples, event.nativeEvent].map(point));
  };

  return (
    <section ref={section} className="sand-writing-screen" aria-label={text.sandWriting}>
      <canvas ref={base} className="sand-writing-base" aria-hidden="true" />
      <canvas
        ref={canvas}
        className="sand-writing-canvas"
        aria-label={text.sandWriting}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.preventDefault();
          if (open) { close(); return; }
          if (event.button !== 0 || !drawing.begin(event.pointerId, point(event), tip)) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (drawing.pointer !== event.pointerId) return;
          move(event);
          stop();
        }}
        onPointerCancel={(event) => { if (drawing.pointer === event.pointerId) stop(); }}
        onLostPointerCapture={(event) => drawing.end(event.pointerId)}
      />
      <Button className="sand-writing-home" onClick={() => { stop(); onHome(); }}>
        <Home aria-hidden="true" size={22} /><span className="sand-writing-home-word">{text.home}</span>
      </Button>
      <div ref={picker} className="sand-writing-picker" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
        <Button
          ref={trigger}
          className="sand-writing-stick"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => { stop(); if (open) close(); else setOpen(true); }}
        >
          <span className="sand-writing-stick-face"><SandStroke width={tip} /></span>
          <span className="sand-writing-word">{text.sandTipPicker}</span>
        </Button>
        <div ref={panel} id={panelId} className="sand-writing-options" role="group" aria-label={text.sandTipPicker} aria-hidden={!open} inert={!open} data-open={open || undefined}>
          <div className="sand-writing-tips">
            {TIP_WIDTHS.map((width) => (
              <Button key={width} className="sand-writing-tip" aria-pressed={tip === width} onClick={() => { if (open) { setTip(width); close(); } }}>
                <span className="sand-writing-tip-face">
                  <SandStroke width={width} />
                  {tip === width && <span className="sand-writing-tick"><Check aria-hidden="true" size={14} strokeWidth={3} /></span>}
                </span>
                <span className="sand-writing-word">{text.sandTip(width)}</span>
              </Button>
            ))}
          </div>
          <Button className="sand-writing-clear" onClick={() => { if (open) { stop(); drawing.clear(); cover.current(); close(); } }}>
            <Eraser aria-hidden="true" size={22} />{text.sandClear}
          </Button>
        </div>
      </div>
    </section>
  );
}
