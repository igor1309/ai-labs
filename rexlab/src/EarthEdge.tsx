// Stretch the whole edge so every layer meets both sides of its window.
export function EarthEdge({ className = "home-earth-wave" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 1440 30" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 10q60-10 120 0t120 0q60 10 120 0t120 0q60-10 120 0t120 0q60 10 120 0t120 0q60-10 120 0t120 0q60 10 120 0t120 0l0 20-1440 0z" />
  </svg>;
}
