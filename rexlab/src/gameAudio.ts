import type { Language } from "./language/language.ts";

export type AudioPreferenceStore = { load(): boolean | undefined; save(muted: boolean): void };
type Sounds<Sound> = { play(sound: Sound, pitch?: number): void; stop(): void };
type Voice = { speak(words: string, language: Language): void; stop(): void };

export function gameAudio<Sound>(sounds: Sounds<Sound>, voice: Voice, store: AudioPreferenceStore) {
  let muted = store.load() ?? false;
  let generation = 0;
  const wrap = (allowed: () => boolean) => ({
    sounds: { play(sound: Sound, pitch?: number) { if (allowed()) sounds.play(sound, pitch); }, stop: () => sounds.stop() },
    voice: { speak(words: string, language: Language) { if (allowed()) voice.speak(words, language); }, stop: () => voice.stop() }
  });
  return {
    ...wrap(() => !muted),
    muted: () => muted,
    toggle() {
      muted = !muted;
      if (muted) { generation++; voice.stop(); sounds.stop(); }
      store.save(muted);
      return muted;
    },
    // A muted reaction's queued sounds stay cancelled after sound is enabled again.
    sequence() {
      const current = generation;
      const enabled = !muted;
      return wrap(() => enabled && !muted && current === generation);
    }
  };
}
