import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import type { Attribute } from "./quiz/round.ts";

const NUMBERS: Record<Language, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en", { maximumFractionDigits: 1 }),
  ru: new Intl.NumberFormat("ru", { maximumFractionDigits: 1 })
};

// Values are estimates, written as plainly as a child reads them: mass in
// whole kilograms below a tonne and in tonnes to one decimal from there,
// height in metres to one decimal. A trailing zero decimal is dropped, and
// the number and its unit are written in the chosen language.
export function formatValue(attribute: Attribute, value: number, language: Language): string {
  const { units } = TEXTS[language];
  const number = (n: number) => NUMBERS[language].format(n);
  if (attribute === "height") {
    return `${number(oneDecimal(value))} ${units.metres}`;
  }
  const kilograms = Math.round(value);
  return kilograms < 1000 ? `${number(kilograms)} ${units.kilograms}` : `${number(oneDecimal(value / 1000))} ${units.tonnes}`;
}

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
