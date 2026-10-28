import type { Language } from "./language/language.ts";

export type JawSound = "snap" | "chomp" | "ow" | "hmm" | "steps" | "slide";
export type JawSounds = { play(sound: JawSound): void; stop(): void };
export type JawVoice = { speak(words: string, language: Language): void; stop(): void };

// Short pitch sweeps make the reactions playful without a failure buzzer.
const NOTES: Record<JawSound, readonly [number, number, number][]> = {
  snap: [[900, 300, 0.06]], chomp: [[130, 60, 0.12], [150, 70, 0.12]],
  ow: [[450, 800, 0.18]], hmm: [[220, 280, 0.3]],
  steps: [[90, 45, 0.1], [80, 40, 0.1]], slide: [[500, 160, 0.2]]
};

export function jawSounds(makeAudio: () => AudioContext | undefined): JawSounds {
  let audio: AudioContext | undefined;
  const playing = new Set<OscillatorNode>();
  const stop = () => {
    for (const node of playing) { try { node.stop(); } catch { /* Already ended. */ } }
    playing.clear();
  };
  return { stop, play(sound) {
    try {
      audio ??= makeAudio();
      if (!audio) return;
      void audio.resume().catch(() => {});
      NOTES[sound].forEach(([from, to, length], at) => {
        const node = audio!.createOscillator();
        const gain = audio!.createGain();
        const start = audio!.currentTime + at * 0.25;
        node.type = sound === "chomp" ? "sawtooth" : "triangle";
        node.frequency.setValueAtTime(from, start);
        node.frequency.exponentialRampToValueAtTime(to, start + length);
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + length);
        node.connect(gain).connect(audio!.destination);
        playing.add(node);
        node.onended = () => playing.delete(node);
        node.start(start);
        node.stop(start + length);
      });
    } catch { stop(); }
  } };
}

export function jawVoice(speech: Pick<SpeechSynthesis, "speak" | "cancel"> | undefined, utterance: (words: string) => SpeechSynthesisUtterance): JawVoice {
  const stop = () => { try { speech?.cancel(); } catch { /* Speech is optional. */ } };
  return { stop, speak(words, language) {
    try {
      stop();
      if (!speech) return;
      const line = utterance(words);
      line.lang = language === "ru" ? "ru-RU" : "en-US";
      speech.speak(line);
    } catch { /* Speech is optional. */ }
  } };
}
