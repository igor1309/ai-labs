// Find the pair's symbols that the outline icon set lacks, drawn as its
// board has them: Phosphor's filled cards (MIT) for the game, and
// Material Symbols' rounded stairs (Apache 2.0) for the climb level.
export function CardsFill({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M200,88V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V88A16,16,0,0,1,40,72H184A16,16,0,0,1,200,88Zm16-48H64a8,8,0,0,0,0,16H216V176a8,8,0,0,0,16,0V56A16,16,0,0,0,216,40Z" /></svg>;
}

export function Stairs({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M417-373h63q17 0 28.5-11.5T520-413v-93h63q17 0 28.5-11.5T623-546v-94h57q17 0 28.5-11.5T720-680q0-17-11.5-28.5T680-720h-97q-17 0-28.5 11.5T543-680v93h-63q-17 0-28.5 11.5T440-547v93h-63q-17 0-28.5 11.5T337-414v94h-57q-17 0-28.5 11.5T240-280q0 17 11.5 28.5T280-240h97q17 0 28.5-11.5T417-280v-93ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" /></svg>;
}
