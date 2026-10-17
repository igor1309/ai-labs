import { isThemeChoice, type ThemeChoice } from "./theme.ts";

export const THEME_KEY = "rexlab-theme";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

// The theme a parent chose, kept in browser storage on the same
// best-effort basis as the language: storage that cannot be read or holds
// something else gives no choice, and a choice that cannot be saved still
// applies until the app is closed.
export function localTheme(storage: () => KeyValueStorage) {
  return {
    load(): ThemeChoice | undefined {
      try {
        const raw = storage().getItem(THEME_KEY);
        return isThemeChoice(raw) ? raw : undefined;
      } catch {
        return undefined;
      }
    },

    save(choice: ThemeChoice): void {
      try {
        storage().setItem(THEME_KEY, choice);
      } catch {
        return;
      }
    }
  };
}
