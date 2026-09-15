// Times within one notional day, so scenarios can say "10:01" and mean it.
export function at(time: string): Date {
  return new Date(`2026-09-15T${time}:00Z`);
}
