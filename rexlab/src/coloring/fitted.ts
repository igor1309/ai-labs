import type { Geometry, View } from "./geometry.ts";
import { TRICERATOPS } from "./triceratops.ts";
import { TRICERATOPS_EXPLORER } from "./triceratopsExplorer.ts";
import { STEGOSAURUS_EXPLORER } from "./stegosaurusExplorer.ts";
import { ANKYLOSAURUS_HATCHLING, ANKYLOSAURUS_EXPLORER } from "./ankylosaurusScene.ts";
import { TREX_HATCHLING } from "./trexScene.ts";
import { MOSASAURUS_HATCHLING } from "./mosasaurusScene.ts";
import { BRACHIOSAURUS_HATCHLING } from "./brachiosaurusScene.ts";
import { PTERANODON_HATCHLING, PTERANODON_EXPLORER } from "./pteranodonScene.ts";
import { PARASAUROLOPHUS_HATCHLING } from "./parasaurolophusScene.ts";
import { SPINOSAURUS_HATCHLING } from "./spinosaurusScene.ts";

// A drawing that left empty canvas round it, enlarged so it touches the canvas
// edges in its tighter direction and centred in the other. Same regions and
// ink as the original; a new version so saved works keep their picture.
function fitted(geometry: Geometry, version: string, view: View): Geometry {
  return Object.freeze({ ...geometry, artwork: Object.freeze({ version, regions: geometry.artwork.regions }), view: Object.freeze(view) });
}

export const TRICERATOPS_FITTED = fitted(TRICERATOPS, "triceratops-production-2", { scale: 1.1267, x: -36.5, y: -42.5 });
export const STEGOSAURUS_EXPLORER_FITTED = fitted(STEGOSAURUS_EXPLORER, "stegosaurus-explorer-2", { scale: 1.0529, x: -12, y: -13 });
export const TRICERATOPS_EXPLORER_FITTED = fitted(TRICERATOPS_EXPLORER, "triceratops-explorer-2", { scale: 1.0529, x: -12, y: -10 });
export const ANKYLOSAURUS_HATCHLING_FITTED = fitted(ANKYLOSAURUS_HATCHLING, "ankylosaurus-hatchling-3", { scale: 1.0553, x: -17.47, y: -15.17 });
export const ANKYLOSAURUS_EXPLORER_FITTED = fitted(ANKYLOSAURUS_EXPLORER, "ankylosaurus-explorer-2", { scale: 1.0553, x: -17.5, y: -14 });
export const TREX_HATCHLING_FITTED = fitted(TREX_HATCHLING, "trex-hatchling-2", { scale: 1.0815, x: -20.5, y: -36 });
export const MOSASAURUS_HATCHLING_FITTED = fitted(MOSASAURUS_HATCHLING, "mosasaurus-hatchling-2", { scale: 1.0664, x: -18, y: -28.5 });
export const BRACHIOSAURUS_HATCHLING_FITTED = fitted(BRACHIOSAURUS_HATCHLING, "brachiosaurus-hatchling-2", { scale: 1.0621, x: -16, y: -14 });
export const PTERANODON_HATCHLING_FITTED = fitted(PTERANODON_HATCHLING, "pteranodon-hatchling-2", { scale: 1.0639, x: -14.5, y: -12.5 });
export const PTERANODON_EXPLORER_FITTED = fitted(PTERANODON_EXPLORER, "pteranodon-explorer-2", { scale: 1.0339, x: -8, y: -5.5 });
export const PARASAUROLOPHUS_HATCHLING_FITTED = fitted(PARASAUROLOPHUS_HATCHLING, "parasaurolophus-hatchling-2", { scale: 1.0764, x: -20.5, y: -18.5 });
export const SPINOSAURUS_HATCHLING_FITTED = fitted(SPINOSAURUS_HATCHLING, "spinosaurus-hatchling-2", { scale: 1.0445, x: -12, y: -29 });

// Each enlarged version with the one it enlarges.
export const FITTED: readonly (readonly [Geometry, Geometry])[] = [
  [TRICERATOPS_FITTED, TRICERATOPS], [STEGOSAURUS_EXPLORER_FITTED, STEGOSAURUS_EXPLORER],
  [TRICERATOPS_EXPLORER_FITTED, TRICERATOPS_EXPLORER], [ANKYLOSAURUS_HATCHLING_FITTED, ANKYLOSAURUS_HATCHLING],
  [ANKYLOSAURUS_EXPLORER_FITTED, ANKYLOSAURUS_EXPLORER], [TREX_HATCHLING_FITTED, TREX_HATCHLING],
  [MOSASAURUS_HATCHLING_FITTED, MOSASAURUS_HATCHLING], [BRACHIOSAURUS_HATCHLING_FITTED, BRACHIOSAURUS_HATCHLING],
  [PTERANODON_HATCHLING_FITTED, PTERANODON_HATCHLING], [PTERANODON_EXPLORER_FITTED, PTERANODON_EXPLORER],
  [PARASAUROLOPHUS_HATCHLING_FITTED, PARASAUROLOPHUS_HATCHLING], [SPINOSAURUS_HATCHLING_FITTED, SPINOSAURUS_HATCHLING]
];
