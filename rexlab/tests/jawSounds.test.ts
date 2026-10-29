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

const utterance = (words: string) => ({ text: words, voice: null } as SpeechSynthesisUtterance);
const availableVoice = (name: string, lang: string, preferred = false, voiceURI = name): SpeechSynthesisVoice =>
  ({ name, lang, default: preferred, voiceURI, localService: true });
function speechSpy() {
  return { speak: vi.fn<(line: SpeechSynthesisUtterance) => void>(), cancel: vi.fn(), getVoices: vi.fn<() => SpeechSynthesisVoice[]>(() => []) };
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

  it("changes both bites by the shelf jaw's pitch while keeping their timing", () => {
    const { audio, nodes } = audioSpy();
    jawSounds(() => audio).play("chomp", 1.4);
    expect(nodes.map(({ pitches }) => pitches)).toEqual([[182, 84], [210, 98]]);
    expect(nodes.map(({ start }) => start.mock.calls[0]![0])).toEqual([10, 10.25]);
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
    const speech = speechSpy();
    const voice = jawVoice(speech, utterance);
    voice.speak("THICK TEETH", "en");
    voice.speak("ТОЛСТЫЕ ЗУБЫ", "ru");
    expect(speech.speak.mock.calls.map(([{ text, lang, voice }]) => [text, lang, voice]))
      .toEqual([["Thick teeth", "en-US", null], ["Толстые зубы", "ru-RU", null]]);
    expect(speech.cancel.mock.invocationCallOrder[0]).toBeLessThan(speech.speak.mock.invocationCallOrder[0]!);
    expect(speech.cancel.mock.invocationCallOrder[1]).toBeLessThan(speech.speak.mock.invocationCallOrder[1]!);
    voice.stop();
    expect(speech.cancel).toHaveBeenCalledTimes(3);
    const unavailable = jawVoice(undefined, () => { throw new Error("unavailable"); });
    expect(() => unavailable.speak("TEETH", "en")).not.toThrow();
    expect(() => unavailable.stop()).not.toThrow();
    const denied = jawVoice({ getVoices: () => [], cancel() { throw new Error("denied"); }, speak() { throw new Error("denied"); } }, utterance);
    expect(() => denied.speak("TEETH", "en")).not.toThrow();
    expect(() => denied.stop()).not.toThrow();
  });

  it.each(["Enhanced", "Premium", "Natural", "Neural", "High Quality"])("prefers an advertised %s voice within the requested language regardless of list order", (quality) => {
    for (const language of ["en", "ru"] as const) {
      const locale = language === "ru" ? "ru-RU" : "en-US";
      const basic = availableVoice("Basic", locale, true);
      const better = availableVoice(`Speaker (${quality})`, language === "ru" ? "RU_ru" : "en-GB");
      const foreign = availableVoice(`Foreign ${quality}`, language === "ru" ? "en-US" : "ru-RU", true);
      const speech = speechSpy();
      const voice = jawVoice(speech, utterance);
      for (const voices of [[foreign, basic, better], [better, basic, foreign]]) {
        speech.getVoices.mockReturnValue(voices);
        voice.speak("TEETH", language);
        expect(speech.speak.mock.lastCall![0].voice).toBe(better);
        expect(speech.speak.mock.lastCall![0].lang).toBe(locale);
      }
    }
  });

  it("recognizes quality in a voice URI and never lets a foreign natural default beat a matching basic voice", () => {
    const russian = availableVoice("Russian", "ru-RU");
    const enhanced = availableVoice("Speaker", "ru-RU", false, "provider:ru-enhanced");
    const foreign = availableVoice("Natural", "en-US", true);
    const speech = speechSpy();
    const voice = jawVoice(speech, utterance);
    speech.getVoices.mockReturnValue([foreign, russian, enhanced]);
    voice.speak("ЗУБЫ", "ru");
    expect(speech.speak.mock.lastCall![0].voice).toBe(enhanced);
    speech.getVoices.mockReturnValue([foreign, russian]);
    voice.speak("ЗУБЫ", "ru");
    expect(speech.speak.mock.lastCall![0].voice).toBe(russian);
  });

  it("breaks equal-quality ties by locale, then language default, then browser order", () => {
    const regional = availableVoice("Regional", "en-GB", true);
    const exact = availableVoice("Exact", "en-US");
    const preferred = availableVoice("Preferred", "en-US", true);
    const other = availableVoice("Other", "en-US", true);
    const speech = speechSpy();
    const voice = jawVoice(speech, utterance);
    for (const [voices, expected] of [
      [[regional, exact], exact], [[exact, preferred], preferred], [[preferred, other], preferred],
      [[availableVoice("Regional", "en-AU"), regional], regional]
    ] as const) {
      speech.getVoices.mockReturnValue([...voices]);
      voice.speak("TEETH", "en");
      expect(speech.speak.mock.lastCall![0].voice).toBe(expected);
    }
  });

  it("discovers voices populated after construction and refreshes them for later requests and language changes", () => {
    const speech = speechSpy();
    const voice = jawVoice(speech, utterance);
    const russian = availableVoice("Russian", "ru-RU");
    speech.getVoices.mockReturnValue([russian]);
    voice.speak("ЗУБЫ", "ru");
    expect(speech.speak.mock.lastCall![0].voice).toBe(russian);
    speech.getVoices.mockReturnValue([]);
    voice.speak("ЗУБЫ", "ru");
    expect(speech.speak.mock.lastCall![0].voice).toBeNull();
    const enhanced = availableVoice("Enhanced", "ru-RU");
    const english = availableVoice("English Natural", "en-US");
    speech.getVoices.mockReturnValue([russian, english, enhanced]);
    voice.speak("ЗУБЫ", "ru");
    expect(speech.speak.mock.lastCall![0].voice).toBe(enhanced);
    voice.speak("TEETH", "en");
    expect(speech.speak.mock.lastCall![0]).toMatchObject({ voice: english, lang: "en-US" });
    voice.speak("ЗУБЫ", "ru");
    expect(speech.speak.mock.lastCall![0]).toMatchObject({ voice: enhanced, lang: "ru-RU" });
  });

  it.each(["empty", "foreign", "throws"])("uses the requested language when voice discovery is %s", (kind) => {
    const speech = speechSpy();
    if (kind === "foreign") speech.getVoices.mockReturnValue([availableVoice("English Natural", "en-US", true)]);
    if (kind === "throws") speech.getVoices.mockImplementation(() => { throw new Error("unavailable"); });
    jawVoice(speech, utterance).speak("ЗУБЫ", "ru");
    expect(speech.speak.mock.lastCall![0]).toMatchObject({ text: "Зубы", lang: "ru-RU", voice: null });
  });

  it.each([
    ["en", "THICK TEETH. STRONG JAW! WHOSE JAW? MINE.", "Thick teeth. Strong jaw! Whose jaw? Mine."],
    ["ru", "ТОЛСТЫЕ ЗУБЫ. КРЕПКАЯ ЧЕЛЮСТЬ! ЧЬЯ ЧЕЛЮСТЬ? МОЯ.", "Толстые зубы. Крепкая челюсть! Чья челюсть? Моя."],
    ["ru", "🦷 ЁЛКИ! «ЧЬЯ ЧЕЛЮСТЬ?»", "🦷 Ёлки! «Чья челюсть?»"],
    ["en", "Tyrannosaurus. ITS THICK TEETH COULD CRUSH BONES.", "Tyrannosaurus. Its thick teeth could crush bones."],
    ["ru", "Тираннозавр. ЕГО ТОЛСТЫЕ ЗУБЫ МОГЛИ ДРОБИТЬ КОСТИ.", "Тираннозавр. Его толстые зубы могли дробить кости."],
    ["en", "Tyrannosaurus. A strong jaw.", "Tyrannosaurus. A strong jaw."],
    ["ru", "Тираннозавр. Крепкая челюсть.", "Тираннозавр. Крепкая челюсть."]
  ] as const)("narrates %s text in sentence case while preserving authored mixed case: %s", (language, words, expected) => {
    const speech = speechSpy();
    jawVoice(speech, utterance).speak(words, language);
    expect(speech.speak.mock.lastCall![0].text).toBe(expected);
  });
});
