import { describe, expect, it } from "vitest";
import { SILENT, skeletonSounds, type SkeletonSound } from "../src/skeletonSounds.ts";

// skeleton-assembly-alive.feature: sounds are made with Web Audio, and an
// iPad that cannot make them still plays.

// A stand-in for Web Audio that counts what each sound starts.
function fakeAudio() {
  const started = { tones: 0, noises: 0, resumed: 0 };
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 };
  const node = () => ({ connect: (next: unknown) => next });
  const audio = {
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume: async () => {
      started.resumed += 1;
    },
    createOscillator: () => ({ ...node(), type: "", frequency: param, start: () => (started.tones += 1), stop() {} }),
    createGain: () => ({ ...node(), gain: param }),
    createBiquadFilter: () => ({ ...node(), frequency: param }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => ({ ...node(), buffer: null, start: () => (started.noises += 1) })
  };
  return { audio: audio as unknown as AudioContext, started };
}

describe("the skeleton game's sounds", () => {
  it("make the audio once, on the first sound, and start each sound's tones and noises", () => {
    const { audio, started } = fakeAudio();
    let made = 0;
    const sounds = skeletonSounds(() => {
      made += 1;
      return audio;
    });
    expect(made).toBe(0);

    const plays = (["lift", "click", "jaw", "boing", "roar"] as const).map((sound): [SkeletonSound, number, number] => {
      const before = { ...started };
      sounds.play(sound);
      return [sound, started.tones - before.tones, started.noises - before.noises];
    });

    expect([made, started.resumed]).toEqual([1, 5]);
    expect(plays).toEqual([
      ["lift", 1, 0],
      ["click", 1, 1],
      ["jaw", 0, 2],
      ["boing", 2, 0],
      ["roar", 3, 3]
    ]);
  });

  it("are silent, never failing, with no Web Audio or audio that refuses", () => {
    const refusing = () => {
      throw new Error("no audio");
    };
    expect(() => skeletonSounds(() => undefined).play("roar")).not.toThrow();
    expect(() => skeletonSounds(refusing).play("boing")).not.toThrow();
    expect(() => skeletonSounds().play("lift")).not.toThrow();
    expect(() => SILENT.play("click")).not.toThrow();
  });
});
