import type { JawChoiceView } from "./WhoseJawBoardScreen.tsx";

// Percentages of the entire 800 × 600 gummy canvas, including its clear
// margins. The supplied skulls face left; the flying fisher faces right.
const MOUTHS: Readonly<Record<string, JawChoiceView["mouth"]>> = {
  tyrannosaurus: { x: 16, y: 36, width: 23, mirror: false, angle: -8 },
  allosaurus: { x: 14, y: 37, width: 21, mirror: false, angle: -8 },
  triceratops: { x: 14, y: 55, width: 12, mirror: false, angle: -15 },
  edmontosaurus: { x: 13, y: 35, width: 14, mirror: false, angle: -12 },
  velociraptor: { x: 12, y: 33, width: 17, mirror: false, angle: -12 },
  deinonychus: { x: 12, y: 34, width: 15, mirror: false, angle: -15 },
  diplodocus: { x: 6, y: 27, width: 7, mirror: false, angle: -10 },
  brachiosaurus: { x: 6, y: 25, width: 8, mirror: false, angle: -12 },
  stegosaurus: { x: 9, y: 52, width: 9, mirror: false, angle: -12 },
  ankylosaurus: { x: 9, y: 54, width: 9, mirror: false, angle: -8 },
  spinosaurus: { x: 15, y: 35, width: 24, mirror: false, angle: -10 },
  baryonyx: { x: 15, y: 32, width: 23, mirror: false, angle: -10 },
  rhamphorhynchus: { x: 80, y: 49, width: 15, mirror: true, angle: 25 },
  dimorphodon: { x: 20, y: 38, width: 19, mirror: false, angle: -18 },
  mosasaurus: { x: 15, y: 43, width: 24, mirror: false, angle: -8 },
  kronosaurus: { x: 15, y: 40, width: 25, mirror: false, angle: -8 }
};

export function jawMouth(id: string): JawChoiceView["mouth"] {
  const mouth = MOUTHS[id];
  if (!mouth) throw new Error(`No gummy mouth for ${id}`);
  return mouth;
}
