// The orientation as the portrait media query reports it.
export type MediaOrientation = {
  portrait(): boolean;
  // Calls `onChange` on each change until the returned function is called.
  watch(onChange: () => void): () => void;
};

export function mediaOrientation(matchMedia: (query: string) => MediaQueryList): MediaOrientation {
  const query = matchMedia("(orientation: portrait)");
  return {
    portrait: () => query.matches,
    watch: (onChange) => {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
  };
}
