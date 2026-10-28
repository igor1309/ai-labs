import { describe, expect, it, vi } from "vitest";
import { jawSounds, jawVoice, type JawSound } from "../src/jawSounds.ts";

function audioSpy() {
  const nodes: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null; pitches: number[]; type: string }> = [];
  const audio = {
    currentTime: 10, destination: {}, resume: vi.fn(async () => {}),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({}) }),
    createOscillator: () => {
      const pitches: number[] = [];
      const node = { type: "", start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null, pitches,
        frequency: { setValueAtTime: (value: number) => pitches.push(value), exponentialRampToValueAtTime: (value: number) => pitches.push(value) },
        connect: (gain: unknown) => gain };
      nodes.push(node);
      return node;
    }
  };
  return { audio: audio as unknown as AudioContext, nodes };
}

describe("jaw audio", () => {
  it("lazily synthesizes the six sounds with distinct pitches, two bites and two steps", () => {
    const { audio, nodes } = audioSpy();
    const make = vi.fn(() => audio);
    const sound = jawSounds(make);
    expect(make).not.toHaveBeenCalled();
    const patterns = (["snap", "chomp", "ow", "hmm", "steps", "slide"] as JawSound[]).map((name) => {
      const before = nodes.length;
      sound.play(name);
      return nodes.slice(before).map(({ pitches, start }) => ({ pitches, start: start.mock.calls[0]![0] }));
    });
    expect(make).toHaveBeenCalledTimes(1);
    expect(patterns).toEqual([
      [{ pitches: [900, 300], start: 10 }],
      [{ pitches: [130, 60], start: 10 }, { pitches: [150, 70], start: 10.25 }],
      [{ pitches: [450, 800], start: 10 }], [{ pitches: [220, 280], start: 10 }],
      [{ pitches: [90, 45], start: 10 }, { pitches: [80, 40], start: 10.25 }],
      [{ pitches: [500, 160], start: 10 }]
    ]);
    nodes[0]!.onended!();
    sound.stop();
    expect(nodes[0]!.stop).toHaveBeenCalledTimes(1);
    for (const node of nodes.slice(1)) expect(node.stop).toHaveBeenCalledTimes(2);
    sound.stop();
    for (const node of nodes.slice(1)) expect(node.stop).toHaveBeenCalledTimes(2);
  });

  it("remains playable when audio is absent, refuses construction or rejects resume", async () => {
    expect(() => jawSounds(() => undefined).play("snap")).not.toThrow();
    expect(() => jawSounds(() => { throw new Error("refused"); }).play("snap")).not.toThrow();
    const { audio } = audioSpy();
    vi.spyOn(audio, "resume").mockRejectedValue(new Error("denied"));
    expect(() => jawSounds(() => audio).play("snap")).not.toThrow();
    await Promise.resolve();
  });

  it("replaces speech in the chosen language, stops it on exit and tolerates unavailable speech", () => {
    const lines: SpeechSynthesisUtterance[] = [];
    const speech = { speak: (line: SpeechSynthesisUtterance) => lines.push(line), cancel: vi.fn() };
    const voice = jawVoice(speech, (words) => ({ text: words } as SpeechSynthesisUtterance));
    voice.speak("THICK TEETH", "en");
    voice.speak("ТОЛСТЫЕ ЗУБЫ", "ru");
    expect(lines.map(({ text, lang }) => [text, lang])).toEqual([["THICK TEETH", "en-US"], ["ТОЛСТЫЕ ЗУБЫ", "ru-RU"]]);
    voice.stop();
    expect(speech.cancel).toHaveBeenCalledTimes(3);
    const unavailable = jawVoice(undefined, () => { throw new Error("unavailable"); });
    expect(() => unavailable.speak("TEETH", "en")).not.toThrow();
    expect(() => jawVoice({ cancel() { throw new Error("denied"); }, speak() { throw new Error("denied"); } },
      (words) => ({ text: words } as SpeechSynthesisUtterance)).speak("TEETH", "en")).not.toThrow();
  });
});
