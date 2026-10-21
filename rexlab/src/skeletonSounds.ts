// The skeleton game's sounds (skeleton-assembly-alive.feature), made with
// Web Audio rather than recorded: a click is a short burst of noise, a
// boing a tone sliding up and back. Browsers start audio only after a
// touch, so the context is made on the first sound, and without Web Audio
// every sound is silent; nothing ever waits for one.

// A bone picked up, a bone fitting home, a skull fitting with its jaw
// snapping, a drop that misses, and the finished skeleton stomping and
// roaring.
export type SkeletonSound = "lift" | "click" | "jaw" | "boing" | "roar";

export type SkeletonSounds = { play(sound: SkeletonSound): void };

export const SILENT: SkeletonSounds = { play: () => {} };

type Tone = { at: number; length: number; from: number; to?: number; wave?: OscillatorType; volume?: number };
type Noise = { at: number; length: number; filter: number; volume?: number };
type Sound = { tones?: readonly Tone[]; noises?: readonly Noise[] };

const SOUNDS: Record<SkeletonSound, Sound> = {
  lift: { tones: [{ at: 0, length: 0.09, from: 420, to: 640, wave: "sine", volume: 0.12 }] },
  click: { noises: [{ at: 0, length: 0.05, filter: 2600 }], tones: [{ at: 0, length: 0.08, from: 900, to: 600, wave: "triangle", volume: 0.1 }] },
  jaw: { noises: [0, 0.16].map((at) => ({ at, length: 0.05, filter: 3200, volume: 0.3 })) },
  boing: {
    tones: [
      { at: 0, length: 0.18, from: 180, to: 520, wave: "sine" },
      { at: 0.18, length: 0.22, from: 520, to: 200, wave: "sine" }
    ]
  },
  // Two stomps, low thuds, then a roar: a growling tone sliding down over
  // rough noise.
  roar: {
    noises: [
      { at: 0, length: 0.18, filter: 160, volume: 0.5 },
      { at: 0.3, length: 0.18, filter: 160, volume: 0.5 },
      { at: 0.55, length: 0.8, filter: 700, volume: 0.22 }
    ],
    tones: [
      { at: 0, length: 0.2, from: 90, to: 45, wave: "sine", volume: 0.3 },
      { at: 0.3, length: 0.2, from: 90, to: 45, wave: "sine", volume: 0.3 },
      { at: 0.55, length: 0.8, from: 220, to: 90, wave: "sawtooth", volume: 0.14 }
    ]
  }
};

// The browser's audio, none where it has no Web Audio.
const browserAudio = (): AudioContext | undefined => (typeof AudioContext === "undefined" ? undefined : new AudioContext());

// `makeAudio` makes the context on the first sound; tests give their own.
export function skeletonSounds(makeAudio: () => AudioContext | undefined = browserAudio): SkeletonSounds {
  let context: AudioContext | undefined;
  const audio = (): AudioContext | undefined => {
    context ??= makeAudio();
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
    play(sound) {
      // A browser that refuses audio leaves the game silent, never broken.
      try {
        const made = audio();
        if (made === undefined) return;
        void made.resume();
        for (const each of SOUNDS[sound].tones ?? []) tone(made, made.currentTime, each);
        for (const each of SOUNDS[sound].noises ?? []) noise(made, made.currentTime, each);
      } catch {
        // Silent.
      }
    }
  };
}
