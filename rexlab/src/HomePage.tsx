import { usePointerState } from "./usePointerState.ts";

export function HomePage({ onCompareDinosaurs }: { onCompareDinosaurs: () => void }) {
  const pointer = usePointerState();
  return (
    <main className="home">
      <button type="button" className="card quiz-card" aria-label="Compare dinosaurs" onClick={onCompareDinosaurs} {...pointer}>
        <span className="quiz-card-picture" role="img" aria-label="Two dinosaurs">
          🦖🦕
        </span>
        <span className="quiz-card-title">Compare dinosaurs</span>
      </button>
    </main>
  );
}
