import { describe, expect, it, vi } from "vitest";
import { gameAudio } from "../src/gameAudio.ts";

function rig(saved: boolean | undefined) {
  const sounds = { play: vi.fn<(sound: string, pitch?: number) => void>(), stop: vi.fn() };
  const voice = { speak: vi.fn(), stop: vi.fn() };
  const store = { load: () => saved, save: vi.fn() };
  return { sounds, voice, store, audio: gameAudio(sounds, voice, store) };
}

describe("game audio", () => {
  it.each([undefined, false, true])("loads %s and forwards only enabled audio with its arguments", (saved) => {
    const { audio, sounds, voice } = rig(saved);
    audio.sounds.play("chomp", 1.4);
    audio.voice.speak("Зубы", "ru");
    expect(audio.muted()).toBe(saved ?? false);
    expect(sounds.play.mock.calls).toEqual(saved ? [] : [["chomp", 1.4]]);
    expect(voice.speak.mock.calls).toEqual(saved ? [] : [["Зубы", "ru"]]);
  });

  it("stops both active outputs immediately, preserves wrapper identity, and only enables subsequent requests", () => {
    const { audio, sounds, voice, store } = rig(false);
    const wrappers = { sounds: audio.sounds, voice: audio.voice };
    audio.sounds.play("snap"); audio.voice.speak("Teeth", "en");
    expect(audio.toggle()).toBe(true);
    expect([sounds.stop.mock.calls.length, voice.stop.mock.calls.length]).toEqual([1, 1]);
    audio.sounds.play("chomp"); audio.voice.speak("Muted", "en");
    expect(audio.toggle()).toBe(false);
    expect(sounds.play.mock.calls).toEqual([["snap", undefined]]);
    expect(voice.speak.mock.calls).toEqual([["Teeth", "en"]]);
    audio.sounds.play("slide", .8); audio.voice.speak("New", "en");
    expect(sounds.play.mock.lastCall).toEqual(["slide", .8]);
    expect(voice.speak.mock.lastCall).toEqual(["New", "en"]);
    expect(store.save.mock.calls).toEqual([[true], [false]]);
    expect(audio.sounds).toBe(wrappers.sounds); expect(audio.voice).toBe(wrappers.voice);
  });

  it("keeps queued reactions cancelled through mute and unmute, including reactions begun while muted", () => {
    const { audio, sounds, voice } = rig(false);
    const before = audio.sequence();
    audio.toggle();
    const during = audio.sequence();
    audio.toggle();
    for (const sequence of [before, during]) {
      sequence.sounds.play("steps"); sequence.voice.speak("Stale", "en");
    }
    expect(sounds.play.mock.calls).toEqual([]);
    expect(voice.speak.mock.calls).toEqual([]);
    const next = audio.sequence();
    next.sounds.play("chomp", 1.2); next.voice.speak("Fresh", "en");
    expect(sounds.play.mock.calls).toEqual([["chomp", 1.2]]);
    expect(voice.speak.mock.calls).toEqual([["Fresh", "en"]]);
    audio.sounds.stop(); audio.voice.stop();
    expect([sounds.stop.mock.calls.length, voice.stop.mock.calls.length]).toEqual([2, 2]);
  });
});
