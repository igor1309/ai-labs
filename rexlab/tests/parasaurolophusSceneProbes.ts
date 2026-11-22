// Interior landmarks use the persisted 920 × 620 drawing coordinates.
export const parasaurolophusHatchlingProbes: readonly (readonly [number, number, string])[] = [
  [136, 556, "ground"], [788, 524, "reed"], [520, 484, "leg-far-hind"], [696, 528, "arm-far"],
  [548, 284, "body"], [552, 408, "belly"], [608, 84, "crest"], [856, 140, "bill"], [704, 152, "head"],
  [416, 392, "leg-near-hind"], [620, 404, "arm-near"]
];

export const parasaurolophusExplorer1Probes: readonly (readonly [number, number, string])[] = [
  [512, 152, "sky"], [840, 56, "sun"], [344, 116, "cloud"], [80, 360, "far-bank"], [144, 356, "cypress-trunk"],
  [180, 96, "cypress-crown"], [92, 436, "river"], [248, 468, "lily-pad"], [216, 560, "ground"],
  [520, 484, "leg-far-hind"], [696, 528, "arm-far"], [248, 292, "body"], [160, 276, "tail-tip"], [552, 408, "belly"],
  [312, 228, "stripe-hip"], [448, 228, "stripe-back"], [584, 240, "stripe-shoulder"], [608, 84, "crest"], [552, 64, "crest-tip"],
  [856, 140, "bill"], [704, 152, "head"], [416, 392, "leg-near-hind"], [620, 404, "arm-near"],
  [764, 560, "reed-back"], [812, 488, "reed-front"], [872, 272, "cattail"], [108, 552, "swamp-fern"]
];

// Eye and toe ink in the Hatchling and first Explorer scenes.
export const parasaurolophusProtectedProbes: readonly (readonly [number, number])[] = [
  [750, 142], [488, 578]
];

// The traced Explorer scene: one interior point per region, in paint order.
export const parasaurolophusExplorerProbes: readonly (readonly [number, number, string])[] = [
  [133, 83, "sky"], [609, 104, "sun"], [416, 87, "cloud"], [554, 229, "hill-far"], [159, 288, "hill-left"],
  [617, 279, "hill-right"], [796, 246, "hill-behind-tree"], [830, 278, "hill-far-right"], [747, 319, "meadow"], [196, 343, "far-bank"],
  [180, 419, "river-left"], [586, 415, "river-right"], [125, 386, "lily-pad-left"], [660, 423, "lily-pad-right"], [165, 462, "bank-left"],
  [821, 419, "bank-right"], [643, 506, "ground"], [465, 448, "ground-between-legs"], [756, 269, "tree-trunk"], [746, 206, "tree-crown-low"],
  [756, 155, "tree-crown-middle"], [763, 100, "tree-crown-top"], [117, 524, "bush-left"], [796, 517, "bush-right"], [292, 568, "stone-left"],
  [421, 555, "stone-big"], [603, 560, "stone-right"], [238, 416, "arm-far"], [420, 448, "leg-far-hind"], [388, 383, "body"],
  [367, 251, "back-stripe-1"], [481, 270, "back-stripe-2"], [526, 292, "back-stripe-3"], [573, 324, "tail-band-1"], [623, 354, "tail-band-2"],
  [678, 363, "tail-band-3"], [729, 365, "tail-band-4"], [310, 357, "neck"], [256, 351, "throat"], [274, 118, "crest"],
  [214, 208, "head"], [478, 348, "leg-near-hind"], [329, 416, "arm-near"]
];

// Eye and nostril ink in the traced Explorer scene.
export const parasaurolophusExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [168, 200], [102, 239]
];
