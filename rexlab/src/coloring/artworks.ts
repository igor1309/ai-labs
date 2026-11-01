import { ANKYLOSAURUS_HATCHLING, ANKYLOSAURUS_EXPLORER } from "./ankylosaurusScene.ts";
import { ANKYLOSAURUS } from "./ankylosaurus.ts";
import { TRICERATOPS_EXPLORER } from "./triceratopsExplorer.ts";
import { STEGOSAURUS_EXPLORER } from "./stegosaurusExplorer.ts";
import { STEGOSAURUS } from "./geometry.ts";
import { TRICERATOPS } from "./triceratops.ts";
import { TREX_HATCHLING, TREX_EXPLORER } from "./trexScene.ts";

export const ARTWORKS = [
  { geometry: STEGOSAURUS, names: { en: "STEGOSAURUS", ru: "СТЕГОЗАВР" } },
  { geometry: TRICERATOPS, names: { en: "TRICERATOPS", ru: "ТРИЦЕРАТОПС" } },
  { geometry: STEGOSAURUS_EXPLORER, names: { en: "STEGOSAURUS", ru: "СТЕГОЗАВР" } },
  { geometry: TRICERATOPS_EXPLORER, names: { en: "TRICERATOPS", ru: "ТРИЦЕРАТОПС" } },
  { geometry: ANKYLOSAURUS_HATCHLING, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } },
  { geometry: ANKYLOSAURUS_EXPLORER, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } },
  // Saved journals still resolve this version; new selections use the age variants.
  { geometry: ANKYLOSAURUS, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } },
  { geometry: TREX_HATCHLING, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } },
  { geometry: TREX_EXPLORER, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } }
] as const;

export function artworkFor(version: string) {
  const artwork = ARTWORKS.find(entry => entry.geometry.artwork.version === version);
  if (!artwork) throw new Error("Unknown coloring artwork");
  return artwork;
}
