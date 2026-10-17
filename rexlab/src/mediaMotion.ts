// Whether the device asks for reduced motion, as the media query reports
// it each time it is asked: a setting changed meanwhile counts from the
// next reaction on.
export function mediaReducedMotion(matchMedia: (query: string) => MediaQueryList): () => boolean {
  const query = matchMedia("(prefers-reduced-motion: reduce)");
  return () => query.matches;
}
