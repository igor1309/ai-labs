import { ANKYLOSAURUS_HATCHLING, ANKYLOSAURUS_EXPLORER } from "./ankylosaurusScene.ts";
import { ANKYLOSAURUS } from "./ankylosaurus.ts";
import { TRICERATOPS_EXPLORER } from "./triceratopsExplorer.ts";
import { STEGOSAURUS_EXPLORER } from "./stegosaurusExplorer.ts";
import { STEGOSAURUS } from "./geometry.ts";
import { TRICERATOPS } from "./triceratops.ts";
import { MOSASAURUS_HATCHLING, MOSASAURUS_EXPLORER_1 } from "./mosasaurusScene.ts";
import { MOSASAURUS_EXPLORER } from "./mosasaurusExplorer3.ts";
import { MOSASAURUS_EXPLORER_2 } from "./mosasaurusExplorer2.ts";
import { TREX_HATCHLING, TREX_EXPLORER_1 } from "./trexScene.ts";
import { TREX_EXPLORER_3 } from "./trexExplorer.ts";
import { TREX_EXPLORER } from "./trexExplorer5.ts";
import { TREX_EXPLORER_4 } from "./trexExplorer4.ts";
import { TREX_EXPLORER_2 } from "./trexExplorer2.ts";
import { BRACHIOSAURUS_HATCHLING, BRACHIOSAURUS_EXPLORER_1 } from "./brachiosaurusScene.ts";
import { BRACHIOSAURUS_EXPLORER } from "./brachiosaurusExplorer3.ts";
import { BRACHIOSAURUS_EXPLORER_2 } from "./brachiosaurusExplorer2.ts";
import { PTERANODON_HATCHLING, PTERANODON_EXPLORER_1 } from "./pteranodonScene.ts";
import { PTERANODON_EXPLORER } from "./pteranodonExplorer2.ts";
import { PARASAUROLOPHUS_HATCHLING, PARASAUROLOPHUS_EXPLORER_1 } from "./parasaurolophusScene.ts";
import { PARASAUROLOPHUS_EXPLORER } from "./parasaurolophusExplorer3.ts";
import { PARASAUROLOPHUS_EXPLORER_2 } from "./parasaurolophusExplorer2.ts";
import { SPINOSAURUS_HATCHLING, SPINOSAURUS_EXPLORER_1 } from "./spinosaurusScene.ts";
import { SPINOSAURUS_EXPLORER_3 } from "./spinosaurusExplorer.ts";
import { SPINOSAURUS_EXPLORER } from "./spinosaurusExplorer5.ts";
import { SPINOSAURUS_EXPLORER_4 } from "./spinosaurusExplorer4.ts";
import { SPINOSAURUS_EXPLORER_2 } from "./spinosaurusExplorer2.ts";

import { TRICERATOPS_FITTED, STEGOSAURUS_EXPLORER_FITTED, TRICERATOPS_EXPLORER_FITTED, ANKYLOSAURUS_HATCHLING_FITTED, ANKYLOSAURUS_EXPLORER_FITTED, TREX_HATCHLING_FITTED, MOSASAURUS_HATCHLING_FITTED, BRACHIOSAURUS_HATCHLING_FITTED, PTERANODON_HATCHLING_FITTED, PARASAUROLOPHUS_HATCHLING_FITTED, SPINOSAURUS_HATCHLING_FITTED } from "./fitted.ts";

export const ARTWORKS = [
  { geometry: STEGOSAURUS, names: { en: "STEGOSAURUS", ru: "СТЕГОЗАВР" } },
  { geometry: TRICERATOPS_FITTED, names: { en: "TRICERATOPS", ru: "ТРИЦЕРАТОПС" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: TRICERATOPS, names: { en: "TRICERATOPS", ru: "ТРИЦЕРАТОПС" } },
  { geometry: STEGOSAURUS_EXPLORER_FITTED, names: { en: "STEGOSAURUS", ru: "СТЕГОЗАВР" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: STEGOSAURUS_EXPLORER, names: { en: "STEGOSAURUS", ru: "СТЕГОЗАВР" } },
  { geometry: TRICERATOPS_EXPLORER_FITTED, names: { en: "TRICERATOPS", ru: "ТРИЦЕРАТОПС" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: TRICERATOPS_EXPLORER, names: { en: "TRICERATOPS", ru: "ТРИЦЕРАТОПС" } },
  { geometry: ANKYLOSAURUS_HATCHLING_FITTED, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: ANKYLOSAURUS_HATCHLING, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } },
  { geometry: ANKYLOSAURUS_EXPLORER_FITTED, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: ANKYLOSAURUS_EXPLORER, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } },
  // Saved journals still resolve this version; new selections use the age variants.
  { geometry: ANKYLOSAURUS, names: { en: "ANKYLOSAURUS", ru: "АНКИЛОЗАВР" } },
  { geometry: TREX_HATCHLING_FITTED, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: TREX_HATCHLING, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } },
  { geometry: TREX_EXPLORER, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } },
  // Saved journals still resolve this version; new selections use the scene above, which covers the canvas.
  { geometry: TREX_EXPLORER_4, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } },
  // Saved journals still resolve this version; new selections use the Explorer scene above.
  { geometry: TREX_EXPLORER_3, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } },
  { geometry: TREX_EXPLORER_2, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } },
  { geometry: TREX_EXPLORER_1, names: { en: "T-REX", ru: "ТИРАННОЗАВР" } },
  { geometry: MOSASAURUS_HATCHLING_FITTED, names: { en: "MOSASAURUS", ru: "МОЗАЗАВР" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: MOSASAURUS_HATCHLING, names: { en: "MOSASAURUS", ru: "МОЗАЗАВР" } },
  { geometry: MOSASAURUS_EXPLORER, names: { en: "MOSASAURUS", ru: "МОЗАЗАВР" } },
  // Saved journals still resolve this version; new selections use the scene above, which covers the canvas.
  { geometry: MOSASAURUS_EXPLORER_2, names: { en: "MOSASAURUS", ru: "МОЗАЗАВР" } },
  // Saved journals still resolve this version; new selections use the traced scene above.
  { geometry: MOSASAURUS_EXPLORER_1, names: { en: "MOSASAURUS", ru: "МОЗАЗАВР" } },
  { geometry: BRACHIOSAURUS_HATCHLING_FITTED, names: { en: "BRACHIOSAURUS", ru: "БРАХИОЗАВР" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: BRACHIOSAURUS_HATCHLING, names: { en: "BRACHIOSAURUS", ru: "БРАХИОЗАВР" } },
  { geometry: BRACHIOSAURUS_EXPLORER, names: { en: "BRACHIOSAURUS", ru: "БРАХИОЗАВР" } },
  // Saved journals still resolve this version; new selections use the scene above, which covers the canvas.
  { geometry: BRACHIOSAURUS_EXPLORER_2, names: { en: "BRACHIOSAURUS", ru: "БРАХИОЗАВР" } },
  // Saved journals still resolve this version; new selections use the traced scene above.
  { geometry: BRACHIOSAURUS_EXPLORER_1, names: { en: "BRACHIOSAURUS", ru: "БРАХИОЗАВР" } },
  { geometry: PTERANODON_HATCHLING_FITTED, names: { en: "PTERANODON", ru: "ПТЕРАНОДОН" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: PTERANODON_HATCHLING, names: { en: "PTERANODON", ru: "ПТЕРАНОДОН" } },
  { geometry: PTERANODON_EXPLORER, names: { en: "PTERANODON", ru: "ПТЕРАНОДОН" } },
  // Saved journals still resolve this version; new selections use the traced scene above.
  { geometry: PTERANODON_EXPLORER_1, names: { en: "PTERANODON", ru: "ПТЕРАНОДОН" } },
  { geometry: PARASAUROLOPHUS_HATCHLING_FITTED, names: { en: "PARASAUROLOPHUS", ru: "ПАРАЗАУРОЛОФ" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: PARASAUROLOPHUS_HATCHLING, names: { en: "PARASAUROLOPHUS", ru: "ПАРАЗАУРОЛОФ" } },
  { geometry: PARASAUROLOPHUS_EXPLORER, names: { en: "PARASAUROLOPHUS", ru: "ПАРАЗАУРОЛОФ" } },
  // Saved journals still resolve this version; new selections use the scene above, which covers the canvas.
  { geometry: PARASAUROLOPHUS_EXPLORER_2, names: { en: "PARASAUROLOPHUS", ru: "ПАРАЗАУРОЛОФ" } },
  // Saved journals still resolve this version; new selections use the traced scene above.
  { geometry: PARASAUROLOPHUS_EXPLORER_1, names: { en: "PARASAUROLOPHUS", ru: "ПАРАЗАУРОЛОФ" } },
  { geometry: SPINOSAURUS_HATCHLING_FITTED, names: { en: "SPINOSAURUS", ru: "СПИНОЗАВР" } },
  // Saved journals still resolve this version; new selections use the enlarged one above.
  { geometry: SPINOSAURUS_HATCHLING, names: { en: "SPINOSAURUS", ru: "СПИНОЗАВР" } },
  { geometry: SPINOSAURUS_EXPLORER, names: { en: "SPINOSAURUS", ru: "СПИНОЗАВР" } },
  // Saved journals still resolve this version; new selections use the scene above, which covers the canvas.
  { geometry: SPINOSAURUS_EXPLORER_4, names: { en: "SPINOSAURUS", ru: "СПИНОЗАВР" } },
  { geometry: SPINOSAURUS_EXPLORER_3, names: { en: "SPINOSAURUS", ru: "СПИНОЗАВР" } },
  { geometry: SPINOSAURUS_EXPLORER_2, names: { en: "SPINOSAURUS", ru: "СПИНОЗАВР" } },
  // Saved journals still resolve this version; new selections use the Explorer scene above.
  { geometry: SPINOSAURUS_EXPLORER_1, names: { en: "SPINOSAURUS", ru: "СПИНОЗАВР" } }
] as const;

export function artworkFor(version: string) {
  const artwork = ARTWORKS.find(entry => entry.geometry.artwork.version === version);
  if (!artwork) throw new Error("Unknown coloring artwork");
  return artwork;
}
