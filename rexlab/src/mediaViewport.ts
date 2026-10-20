// The screen's orientation is independent of a Split View or desktop
// window's shape. Older browsers can only tell us the window's shape.
export function mediaViewport(
  matchMedia: (query: string) => MediaQueryList,
  screenOrientation: Pick<ScreenOrientation, "type" | "addEventListener" | "removeEventListener"> | undefined,
  window: {
    innerWidth: number;
    addEventListener(type: "resize", listener: () => void): void;
    removeEventListener(type: "resize", listener: () => void): void;
  }
) {
  const portrait = matchMedia("(orientation: portrait)");
  const narrow = matchMedia("(max-width: 599.98px)");
  const short = matchMedia("(max-height: 599.98px)");
  return {
    sizeClass: () => portrait.matches
      ? narrow.matches ? "tall-narrow" as const : "tall" as const
      : short.matches ? "wide-short" as const : "wide" as const,
    isScreenUpright: () => screenOrientation ? screenOrientation.type.startsWith("portrait") : portrait.matches,
    width: () => window.innerWidth,
    subscribe: (onChange: () => void) => {
      const sources = [portrait, narrow, short, ...(screenOrientation ? [screenOrientation] : [])];
      sources.forEach((source) => source.addEventListener("change", onChange));
      window.addEventListener("resize", onChange);
      return () => {
        sources.forEach((source) => source.removeEventListener("change", onChange));
        window.removeEventListener("resize", onChange);
      };
    }
  };
}
