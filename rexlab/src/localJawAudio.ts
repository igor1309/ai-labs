export const JAW_AUDIO_KEY = "rexlab-whose-jaw-muted";

export function localJawAudio(storage: () => Pick<Storage, "getItem" | "setItem">) {
  return {
    load(): boolean | undefined {
      try {
        const value = storage().getItem(JAW_AUDIO_KEY);
        return value === "true" ? true : value === "false" ? false : undefined;
      } catch { return undefined; }
    },
    save(muted: boolean): void {
      try { storage().setItem(JAW_AUDIO_KEY, String(muted)); } catch { /* The current visit still keeps its choice. */ }
    }
  };
}
