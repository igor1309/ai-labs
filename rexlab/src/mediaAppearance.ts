// The device appearance as the colour scheme media query reports it.
export type MediaAppearance = {
  dark(): boolean;
  // Calls `onChange` on each change until the returned function is called.
  watch(onChange: () => void): () => void;
};

export function mediaAppearance(matchMedia: (query: string) => MediaQueryList): MediaAppearance {
  const query = matchMedia("(prefers-color-scheme: dark)");
  return {
    dark: () => query.matches,
    watch: (onChange) => {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
  };
}
