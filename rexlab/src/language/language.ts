export type Language = "en" | "ru";

export const LANGUAGES: readonly Language[] = ["en", "ru"];

// Each language's name in itself, so a parent finds their own whatever
// language the app is in.
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", ru: "Русский" };

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

// The app speaks only English and Russian, so a device in any language
// other than Russian starts in English.
export function languageOfDevice(tag: string): Language {
  return /^ru(?:-|$)/i.test(tag) ? "ru" : "en";
}
