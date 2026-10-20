// The screen's orientation is independent of a Split View or desktop
// window's shape. Older browsers can only tell us the window's shape.
export function mediaViewport(
  matchMedia: (query: string) => MediaQueryList,
  screenOrientation: Pick<ScreenOrientation, "type" | "addEventListener" | "removeEventListener"> | undefined
) {
  const portrait = matchMedia("(orientation: portrait)");
  const narrow = matchMedia("(max-width: 599.98px)");
  const short = matchMedia("(max-height: 599.98px)");
  return {
    sizeClass: () => portrait.matches
      ? narrow.matches ? "tall-narrow" as const : "tall" as const
      : short.matches ? "wide-short" as const : "wide" as const,
    isScreenUpright: () => screenOrientation ? screenOrientation.type.startsWith("portrait") : portrait.matches,
    subscribe: (onChange: () => void) => {
      const sources = [portrait, narrow, short, ...(screenOrientation ? [screenOrientation] : [])];
      sources.forEach((source) => source.addEventListener("change", onChange));
      return () => sources.forEach((source) => source.removeEventListener("change", onChange));
    }
  };
}
