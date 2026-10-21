// The hatch and grow prototype's sounds, made with Web Audio rather than
// recorded: a crunch is a few bursts of noise, a boing a sliding tone.
// Browsers start audio only after a tap, so the context is made on the
// first sound, and without Web Audio every sound is silent.
import type { Reaction } from "./careHatch.ts";

export type Extra = "burp" | "sneeze";
export type Sounds = { play(reaction: Reaction, extra?: Extra): void };

type Tone = { at: number; length: number; from: number; to?: number; wave?: OscillatorType; volume?: number };
type Noise = { at: number; length: number; filter: number; volume?: number };
type Sound = { tones?: Tone[]; noises?: Noise[] };

const notes = (frequencies: number[], step: number, wave: OscillatorType = "triangle"): Tone[] =>
  frequencies.map((from, index) => ({ at: index * step, length: step * 1.4, from, wave }));

const SOUNDS: Record<Reaction | Extra, Sound> = {
  wobble: { tones: [{ at: 0, length: 0.08, from: 180, to: 140, wave: "sine" }] },
  hatch: { noises: [{ at: 0, length: 0.12, filter: 2400 }], tones: [{ at: 0.1, length: 0.25, from: 500, to: 1200, wave: "sine" }] },
  eat: { noises: [0, 0.14, 0.28].map((at) => ({ at, length: 0.07, filter: 1800 })) },
  spit: { tones: [{ at: 0, length: 0.35, from: 220, to: 110, wave: "sawtooth", volume: 0.12 }] },
  drink: { tones: [0, 0.16, 0.32].map((at) => ({ at, length: 0.1, from: 300, to: 520, wave: "sine" })) },
  wash: { noises: [{ at: 0, length: 0.6, filter: 900 }], tones: notes([900, 1100, 1300], 0.12, "sine") },
  splash: { noises: [{ at: 0, length: 0.4, filter: 1200 }] },
  sleep: { noises: [{ at: 0, length: 0.5, filter: 300 }, { at: 0.6, length: 0.5, filter: 300 }] },
  bounce: { tones: [{ at: 0, length: 0.3, from: 160, to: 600, wave: "sine" }, { at: 0.3, length: 0.3, from: 600, to: 160, wave: "sine" }] },
  "not-now": { tones: notes([330, 262], 0.16, "sine") },
  giggle: { tones: notes([900, 1100, 950, 1200, 1000], 0.07, "sine") },
  dance: { tones: notes([523, 659, 784, 1047, 784, 1047], 0.14) },
  burp: { tones: [{ at: 0.35, length: 0.3, from: 120, to: 70, wave: "sawtooth", volume: 0.15 }] },
  sneeze: { noises: [{ at: 0.3, length: 0.25, filter: 3000, volume: 0.3 }] }
};

export function careSounds(): Sounds {
  let context: AudioContext | undefined;
  const audio = (): AudioContext | undefined => {
    if (context === undefined && typeof AudioContext !== "undefined") context = new AudioContext();
    return context;
  };

  const tone = (made: AudioContext, start: number, { at, length, from, to, wave = "square", volume = 0.18 }: Tone) => {
    const oscillator = made.createOscillator();
    const gain = made.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, start + at);
    if (to !== undefined) oscillator.frequency.exponentialRampToValueAtTime(to, start + at + length);
    gain.gain.setValueAtTime(volume, start + at);
    gain.gain.exponentialRampToValueAtTime(0.001, start + at + length);
    oscillator.connect(gain).connect(made.destination);
    oscillator.start(start + at);
    oscillator.stop(start + at + length);
  };

  const noise = (made: AudioContext, start: number, { at, length, filter, volume = 0.25 }: Noise) => {
    const buffer = made.createBuffer(1, Math.ceil(made.sampleRate * length), made.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
    const source = made.createBufferSource();
    const pass = made.createBiquadFilter();
    const gain = made.createGain();
    source.buffer = buffer;
    pass.frequency.value = filter;
    gain.gain.setValueAtTime(volume, start + at);
    gain.gain.exponentialRampToValueAtTime(0.001, start + at + length);
    source.connect(pass).connect(gain).connect(made.destination);
    source.start(start + at);
  };

  return {
    play(reaction, extra) {
      const made = audio();
      if (made === undefined) return;
      void made.resume();
      for (const sound of extra === undefined ? [SOUNDS[reaction]] : [SOUNDS[reaction], SOUNDS[extra]]) {
        for (const each of sound.tones ?? []) tone(made, made.currentTime, each);
        for (const each of sound.noises ?? []) noise(made, made.currentTime, each);
      }
    }
  };
}
