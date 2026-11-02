// What a screen keeps through a change of its layout: each keeper holds
// what it keeps before every change, puts it back after it, and takes it
// afresh once the page has settled at rest, until its stop is called.
// While a motion runs, nothing the child does counts.
export type LayoutKeeping = {
  keep(keeper: { hold(): () => void; rest(): void }): () => void;
  isRunning(): boolean;
};

