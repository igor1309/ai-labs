import { InputError } from "./errors.js";

export function parseDuration(text: string): number {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(text.trim());
  if (!match) throw new InputError(`invalid duration: ${text} (use e.g. 90s, 10m, 1h)`);
  const unit = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[(match[2] ?? "s") as "ms" | "s" | "m" | "h"];
  const value = Number(match[1]) * unit;
  if (value <= 0) throw new InputError(`duration must be positive: ${text}`);
  return value;
}
