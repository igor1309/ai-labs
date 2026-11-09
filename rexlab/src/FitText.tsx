import { useLayoutEffect, useRef, type CSSProperties } from "react";

// A fallback face can be wider than its room, so shrink a single line
// by its measured excess, including after a turn or a font loads.
export function FitText({ className, text, style }: { className: string; text: string; style?: CSSProperties }) {
  const element = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const shown = element.current;
    if (shown === null) return;
    const fit = () => {
      shown.style.removeProperty("font-size");
      // Glyph widths do not scale exactly with size, so measure again until the line fits.
      for (let tries = 0; tries < 4 && shown.scrollWidth > shown.clientWidth; tries++) {
        shown.style.fontSize = `${parseFloat(getComputedStyle(shown).fontSize) * shown.clientWidth / shown.scrollWidth}px`;
      }
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fit);
    if (shown.parentElement) observer?.observe(shown.parentElement);
    document.fonts?.addEventListener("loadingdone", fit);
    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [text]);
  return <span ref={element} className={className} style={style}>{text}</span>;
}
