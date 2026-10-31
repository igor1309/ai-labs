import { ANKYLOSAURUS } from "./ankylosaurus.ts";
import { TRICERATOPS_EXPLORER } from "./triceratopsExplorer.ts";
import { STEGOSAURUS_EXPLORER } from "./stegosaurusExplorer.ts";
import { STEGOSAURUS } from "./geometry.ts";
import { TRICERATOPS } from "./triceratops.ts";

export const ARTWORKS = [
  { geometry: STEGOSAURUS, names: { en: "STEGOSAURUS", ru: "СТЕГОЗАВР" } },
  { geometry: TRICERATOPS, names: { en: "TRICERATOPS", ru: "ТРИЦЕРАТОПС" } },
  { geometry: STEGOSAURUS_EXPLORER, names: { en: "STEGOSAURUS", ru: "СТЕГОЗАВР" } },
  { geometry: TRICERATOPS_EXPLORER, names: { en: "TRICERATOPS", ru: "ТРИЦЕРАТОПС" } },
  { geometry: ANKYLOSAURUS, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } }
] as const;

export function artworkFor(version: string) {
  const artwork = ARTWORKS.find(entry => entry.geometry.artwork.version === version);
  if (!artwork) throw new Error("Unknown coloring artwork");
  return artwork;
}
