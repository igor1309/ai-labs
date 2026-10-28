import { jawMouth } from "../src/jawPresentation.ts";
import jaws from "../src/data/jaws.json";
import dinosaurs from "../src/data/dinosaurs.json";
import { readJaws } from "../src/jawContent.ts";
import type { JawSound } from "../src/jawSounds.ts";
import type { Language } from "../src/language/language.ts";

export const JAWS = readJaws(jaws, dinosaurs);

export function jawGameParts() {
  const played: JawSound[] = [];
  const spoken: Array<{ words: string; language: Language }> = [];
  const stopped = { sound: 0, voice: 0 };
  return {
    mouthFor: jawMouth, jaws: JAWS, jawFor: (id: string) => `jaw-${id}.webp`, gummyFor: (id: string) => `gummy-${id}.webp`, foodFor: (diet: string) => `${diet}.webp`,
    sounds: { play: (sound: JawSound, pitch?: number) => { played.push(sound); }, stop: () => { stopped.sound++; } },
    voice: { speak: (words: string, language: Language) => { spoken.push({ words, language }); }, stop: () => { stopped.voice++; } },
    played, spoken, stopped
  };
}
