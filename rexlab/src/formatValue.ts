import type { Attribute } from "./quiz/round.ts";

// Values are estimates, written as plainly as a child reads them: mass in
// whole kilograms below a tonne and in tonnes to one decimal from there,
// height in metres to one decimal. A trailing ".0" is dropped.
export function formatValue(attribute: Attribute, value: number): string {
  if (attribute === "height") {
    return `${oneDecimal(value)} m`;
  }
  const kilograms = Math.round(value);
  return kilograms < 1000 ? `${kilograms} kg` : `${oneDecimal(value / 1000)} t`;
}

function oneDecimal(value: number): string {
  return String(Math.round(value * 10) / 10);
}
