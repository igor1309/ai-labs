import type { Language } from "./language/language.ts";

export type JawSound = "snap" | "chomp" | "ow" | "hmm" | "steps" | "slide";
export type JawSounds = { play(sound: JawSound, pitch?: number): void; stop(): void };
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
  return { stop, play(sound, pitch = 1) {
    try {
      audio ??= makeAudio();
      if (!audio) return;
      void audio.resume().catch(() => {});
      NOTES[sound].forEach(([from, to, length], at) => {
        const node = audio!.createOscillator();
        const gain = audio!.createGain();
        const start = audio!.currentTime + at * 0.25;
        node.type = sound === "chomp" ? "sawtooth" : "triangle";
        node.frequency.setValueAtTime(from * pitch, start);
        node.frequency.exponentialRampToValueAtTime(to * pitch, start + length);
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

function narration(words: string, language: Language): string {
  // Display capitals can be pronounced as acronyms; authored mixed case keeps proper names.
  return words.replace(/[^.!?]+[.!?]*/gu, (sentence) => sentence !== sentence.toLocaleUpperCase(language) ? sentence
    : sentence.toLocaleLowerCase(language).replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase(language)));
}

function matchingVoice(voices: readonly SpeechSynthesisVoice[], language: Language, locale: string): SpeechSynthesisVoice | undefined {
  const tag = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().replaceAll("_", "-");
  // The browser exposes no quality field; some providers advertise it in the name or URI.
  const rank = (voice: SpeechSynthesisVoice) =>
    (/enhanced|premium|natural|neural|high[- ]quality/i.test(`${voice.name} ${voice.voiceURI}`) ? 4 : 0)
    + (tag(voice) === locale.toLowerCase() ? 2 : 0) + (voice.default ? 1 : 0);
  return voices.filter((voice) => tag(voice).split("-")[0] === language)
    .reduce<SpeechSynthesisVoice | undefined>((best, voice) => !best || rank(voice) > rank(best) ? voice : best, undefined);
}

export function jawVoice(speech: Pick<SpeechSynthesis, "speak" | "cancel" | "getVoices"> | undefined, utterance: (words: string) => SpeechSynthesisUtterance): JawVoice {
  const stop = () => { try { speech?.cancel(); } catch { /* Speech is optional. */ } };
  return { stop, speak(words, language) {
    try {
      stop();
      if (!speech) return;
      const line = utterance(narration(words, language));
      line.lang = language === "ru" ? "ru-RU" : "en-US";
      try {
        // Voice lists can arrive late: refresh per request and use lang until they do.
        const selected = matchingVoice(speech.getVoices(), language, line.lang);
        if (selected) line.voice = selected;
      } catch { /* Voice discovery must not prevent language-based speech. */ }
      speech.speak(line);
    } catch { /* Speech is optional. */ }
  } };
}
