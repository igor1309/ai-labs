export type HomeMotion = (page: HTMLElement) => () => void;

export type HomeMotionEnvironment = {
  scrollToTop(): void;
  watchVisible(tiles: readonly HTMLElement[], reveal: (tile: HTMLElement) => void): () => void;
};

// The sky's slower drift is CSS on the scroll timeline, so it runs with
// the scroll itself and never waits for script.
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

  return () => {
    stopVisible();
    page.removeEventListener("focusin", focus);
    for (const tile of tiles) delete tile.dataset.homeEntrance;
  };
}
