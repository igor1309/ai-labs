import type { Orientation } from "./OrientationGate.tsx";

export function mediaOrientation(matchMedia: (query: string) => MediaQueryList): Orientation {
  const query = matchMedia("(orientation: portrait)");
  return {
    isPortrait: () => query.matches,
    subscribe: (onChange) => {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
  };
}
