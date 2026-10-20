import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

const NUMBERS: Record<Language, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en", { maximumFractionDigits: 1 }),
  ru: new Intl.NumberFormat("ru", { maximumFractionDigits: 1 })
};

// Values are estimates, written as plainly as a child reads them: mass in
// whole grams below a kilogram, in whole kilograms below a tonne and in tonnes to one decimal from there,
// a length in metres to one decimal. A trailing zero decimal is dropped, and
// the number and its unit are written in the chosen language.
export function formatMass(kilograms: number, language: Language): string {
  const { units } = TEXTS[language];
  const grams = Math.round(kilograms * 1000);
  if (grams < 1000) return `${NUMBERS[language].format(grams)} ${units.grams}`;
  const whole = Math.round(kilograms);
  return whole < 1000
    ? `${NUMBERS[language].format(whole)} ${units.kilograms}`
    : `${NUMBERS[language].format(oneDecimal(kilograms / 1000))} ${units.tonnes}`;
}

export function formatLength(metres: number, language: Language): string {
  return `${NUMBERS[language].format(oneDecimal(metres))} ${TEXTS[language].units.metres}`;
}

function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
