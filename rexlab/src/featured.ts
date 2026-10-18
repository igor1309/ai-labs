// A number from 0 up to but not including 1.
export type Random = () => number;

// The game featured on a calendar day, by the day's date, such as
// "2026-10-18".
export type DayChoice = { day: string; game: string };

// What the choice reads: how many times each game has been started, a
// game missing from it never, and the game featured on the day saved,
// if any.
export type FeaturedRecord = {
  starts: Readonly<Record<string, number>>;
  featured: DayChoice | undefined;
};

export type FeaturedStore = {
  load(): FeaturedRecord;
  saveFeatured(choice: DayChoice): void;
};

// The weight of each game, by its start count: 2 for every game started
// least, so ties share it, and 1 for the others.
export function weightsOf(starts: readonly number[]): number[] {
  const least = Math.min(...starts);
  return starts.map((count) => (count === least ? 2 : 1));
}

// The calendar day of `time` on the device's clock, as its date.
export function calendarDay(time: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${time.getFullYear()}-${two(time.getMonth() + 1)}-${two(time.getDate())}`;
}

// Today's featured game among `games`, in their tiles' order. The game
// saved for today stays while it is still offered; any other day, or a
// game gone, draws afresh, laying the games' weights end to end in tile
// order and taking the one the random number falls in, and saves the draw
// for today. Counts of games no longer offered take no part.
export function chooseFeatured<Game extends string>(games: readonly Game[], { store, random, today }: { store: FeaturedStore; random: Random; today: string }): Game {
  const { starts, featured } = store.load();
  const kept = featured?.day === today ? games.find((game) => game === featured.game) : undefined;
  if (kept !== undefined) return kept;
  const weights = weightsOf(games.map((game) => starts[game] ?? 0));
  let point = random() * weights.reduce((sum, weight) => sum + weight, 0);
  // A draw past the last weight, which a random number below 1 never
  // makes, falls to the last game rather than to none.
  const chosen = games.find((_game, at) => (point -= weights[at] ?? 0) < 0) ?? games.at(-1);
  if (chosen === undefined) throw new Error("No game to feature");
  store.saveFeatured({ day: today, game: chosen });
  return chosen;
}
