import amber from "./assets/dig/treasures/amber.webp";
import eggNest from "./assets/dig/treasures/egg-nest.webp";
import goldenFossil from "./assets/dig/treasures/golden-fossil.webp";
import shell from "./assets/dig/treasures/shell.webp";
import tooth from "./assets/dig/treasures/tooth.webp";
import type { TreasureKind } from "./dig/index.ts";

// Each treasure's picture, from `assets/dig/treasures/<kind>.webp`.
export const TREASURE_PICTURES: Readonly<Record<TreasureKind, string>> = { shell, tooth, amber, "egg-nest": eggNest, "golden-fossil": goldenFossil };
