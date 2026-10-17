import { isLanguage, type Language } from "./language/language.ts";

export const LANGUAGE_KEY = "rexlab-language";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

// The language a parent chose, kept in browser storage. Like progress, it
// is kept on a best-effort basis: storage that cannot be read or holds
// something else gives no choice, and a choice that cannot be saved still
// applies until the app is closed.
export function localLanguage(storage: () => KeyValueStorage) {
  return {
    load(): Language | undefined {
      try {
        const raw = storage().getItem(LANGUAGE_KEY);
        return isLanguage(raw) ? raw : undefined;
      } catch {
        return undefined;
      }
    },

    save(language: Language): void {
      try {
        storage().setItem(LANGUAGE_KEY, language);
      } catch {
        return;
      }
    }
  };
}
