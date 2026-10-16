export type Language = "en" | "ru";

export const LANGUAGES: readonly Language[] = ["en", "ru"];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

// The app speaks only English and Russian, so a device in any language
// other than Russian starts in English.
export function languageOfDevice(tag: string): Language {
  return /^ru(?:-|$)/i.test(tag) ? "ru" : "en";
}
