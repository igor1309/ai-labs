export type HomeMotion = (page: HTMLElement) => () => void;

export type HomeMotionEnvironment = {
  scrollToTop(): void;
  scrollY(): number;
  reducedMotion(): boolean;
  subscribeScroll(update: () => void): () => void;
  subscribeMotion(update: () => void): () => void;
  nextFrame(update: () => void): () => void;
  watchVisible(tiles: readonly HTMLElement[], reveal: (tile: HTMLElement) => void): () => void;
};

// A visit owns its entrances. Resize only changes layout, so a tile that
// has appeared stays revealed until the child leaves Home.
export function homeMotion(page: HTMLElement, environment: HomeMotionEnvironment): () => void {
  environment.scrollToTop();
  const tiles = [...page.querySelectorAll<HTMLElement>(".home-ground-tile")];
  for (const tile of tiles) tile.dataset.homeEntrance = "pending";
  const reveal = (tile: HTMLElement) => {
    if (tile.dataset.homeEntrance === "pending") tile.dataset.homeEntrance = "revealed";
  };
  const stopVisible = environment.watchVisible(tiles, reveal);
  // Keyboard navigation can reach a tile before its intersection arrives.
  const focus = (event: FocusEvent) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".home-ground-tile");
    if (tile) reveal(tile);
  };
  page.addEventListener("focusin", focus);

  let cancelFrame: (() => void) | undefined;
  const draw = () => {
    page.style.setProperty("--home-parallax", `${environment.reducedMotion() ? 0 : Math.max(0, environment.scrollY()) / 2}px`);
  };
  const update = () => {
    if (cancelFrame) return;
    cancelFrame = environment.nextFrame(() => {
      cancelFrame = undefined;
      draw();
    });
  };
  const stopScroll = environment.subscribeScroll(update);
  const stopMotion = environment.subscribeMotion(draw);
  draw();
  return () => {
    stopVisible();
    stopScroll();
    stopMotion();
    cancelFrame?.();
    page.removeEventListener("focusin", focus);
    page.style.removeProperty("--home-parallax");
    for (const tile of tiles) delete tile.dataset.homeEntrance;
  };
}
