import { Volume2, VolumeX } from "lucide-react";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

export function GameAudioButton({ language, muted, onToggle }: { language: Language; muted: boolean; onToggle(): void }) {
  const text = TEXTS[language].gameAudio;
  const Icon = muted ? VolumeX : Volume2;
  return <Button className="home-button game-audio-button" aria-label={text.mute} aria-pressed={muted} onClick={onToggle}>
    <Icon aria-hidden="true" /><span>{muted ? text.off : text.on}</span>
  </Button>;
}
