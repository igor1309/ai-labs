// The tooth game's symbol, drawn with the same outline stroke as the
// other icons, since the icon set has no tooth.
export function Tooth({ size = 24, className }: { size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5C10 2 4 2 4 7c0 3 2 4 2 7 0 3 1 6 2 6s1-7 4-7 3 7 4 7 2-3 2-6c0-3 2-4 2-7 0-5-6-5-8-2Z" /></svg>;
}
