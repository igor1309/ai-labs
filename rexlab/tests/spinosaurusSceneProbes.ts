// Interior landmarks use the persisted 920 × 620 drawing coordinates.
export const spinosaurusHatchlingProbes: readonly (readonly [number, number, string])[] = [
  [136, 556, "ground"], [812, 544, "rock"], [424, 504, "leg-far-hind"], [652, 480, "leg-far-front"],
  [420, 200, "sail"], [480, 370, "body"], [500, 448, "belly"], [700, 340, "head"], [840, 330, "snout"],
  [348, 430, "leg-near-hind"], [592, 480, "leg-near-front"]
];

export const spinosaurusExplorer1Probes: readonly (readonly [number, number, string])[] = [
  [480, 60, "sky"], [840, 60, "sun"], [652, 104, "cloud"], [60, 352, "far-bank"], [144, 320, "cypress-trunk"],
  [180, 96, "cypress-crown"], [60, 430, "river"], [248, 468, "lily-pad"], [216, 560, "ground"],
  [424, 504, "leg-far-hind"], [652, 480, "leg-far-front"], [372, 240, "sail"], [310, 280, "sail-stripe-1"],
  [430, 200, "sail-stripe-2"], [550, 280, "sail-stripe-3"], [480, 370, "body"], [80, 388, "tail-tip"], [500, 448, "belly"],
  [700, 340, "head"], [840, 330, "snout"], [348, 430, "leg-near-hind"], [592, 480, "leg-near-front"],
  [768, 540, "reed-back"], [828, 540, "reed-front"], [874, 430, "cattail"], [108, 552, "swamp-fern"]
];

export const spinosaurusExplorer2Probes: readonly (readonly [number, number, string])[] = [
  [778, 150, "sky"], [834, 78, "sun"], [628, 92, "cloud-1"], [280, 74, "cloud-2"], [710, 370, "hills"],
  [164, 254, "cypress-trunk"], [202, 94, "cypress-crown"], [310, 480, "river"], [164, 466, "lily-1"], [572, 482, "lily-2"],
  [204, 562, "ground"], [560, 570, "rock"], [106, 570, "fern"], [832, 488, "reed-1"], [874, 508, "reed-2"],
  [474, 516, "leg-far-hind"], [612, 426, "arm-far"], [166, 298, "tail-fin"], [214, 342, "tail"], [90, 348, "tail-band-1"],
  [172, 340, "tail-band-2"], [256, 336, "tail-band-3"], [336, 280, "sail"], [344, 186, "sail-edge"], [388, 146, "sail-band-1"],
  [496, 116, "sail-band-2"], [608, 260, "sail-band-3"], [652, 304, "body"], [406, 316, "flank-stripe-1"], [494, 312, "flank-stripe-2"],
  [578, 312, "flank-stripe-3"], [608, 388, "belly"], [702, 258, "head"], [830, 260, "snout"], [782, 300, "lower-jaw"],
  [388, 502, "foot-near"], [388, 414, "thigh"], [656, 394, "arm-near"], [770, 394, "fish-tail"], [858, 364, "fish"]
];

// Eye and toe ink in the first two scenes.
export const spinosaurusProtectedProbes: readonly (readonly [number, number])[] = [
  [706, 304], [412, 552]
];

// Eye and claw ink in the Explorer scene.
export const spinosaurusExplorer2ProtectedProbes: readonly (readonly [number, number])[] = [
  [742, 242], [418, 542]
];

export const spinosaurusExplorer3Probes: readonly (readonly [number, number, string])[] = [
  [636, 88, "sky"], [70, 62, "sun"], [744, 90, "cloud-1"], [268, 54, "cloud-2"], [294, 268, "far-hills"],
  [780, 382, "hills"], [152, 220, "fern-trunk"], [82, 182, "frond-left"], [206, 182, "frond-right"], [138, 126, "frond-top"],
  [144, 280, "tail-fin"], [148, 340, "tail"], [110, 320, "tail-stripe-1"], [192, 314, "tail-stripe-2"], [272, 312, "tail-stripe-3"],
  [472, 158, "sail"], [602, 156, "sail-rim"], [410, 210, "sail-band-1"], [548, 112, "sail-band-2"], [330, 318, "body"],
  [436, 278, "flank-stripe-1"], [524, 274, "flank-stripe-2"], [612, 278, "flank-stripe-3"], [604, 368, "belly"], [446, 362, "thigh"],
  [646, 358, "arm-far"], [736, 214, "head"], [764, 256, "lower-jaw"], [688, 350, "arm-near"], [446, 466, "river"],
  [100, 468, "lily-1"], [572, 482, "lily-2"], [204, 562, "ground"], [382, 572, "rock"], [106, 570, "fern"],
  [816, 484, "reed-1"], [860, 514, "reed-2"], [758, 340, "fish-tail"], [856, 336, "fish"]
];

// Eye and nostril or fish-eye ink in the current Explorer scene.
export const spinosaurusExplorer3ProtectedProbes: readonly (readonly [number, number])[] = [
  [773, 211], [872, 322]
];

// Interior probes of the traced Explorer scene, in region order.
export const spinosaurusExplorerProbes: readonly (readonly [number, number, string])[] = [
  [605, 68, "sky"], [158, 82, "sun"], [327, 72, "cloud-1"], [750, 80, "cloud-2"], [647, 191, "hill-far"],
  [129, 199, "hill-left"], [789, 227, "hill-right"], [480, 427, "hill-between-legs"], [585, 350, "hill-behind-leg"], [327, 479, "bank"],
  [370, 561, "river"], [233, 551, "fish"], [147, 464, "palm"], [178, 324, "palm-leaves-1"], [216, 383, "palm-leaves-2"],
  [665, 488, "stone-left"], [777, 470, "stone-big"], [722, 505, "stone-small"], [399, 165, "sail-band-1"], [434, 126, "sail-band-2"],
  [483, 96, "sail-band-3"], [528, 102, "sail-band-4"], [562, 136, "sail-band-5"], [589, 179, "sail-band-6"], [610, 232, "sail-band-7"],
  [435, 438, "leg-far-hind"], [423, 287, "body"], [392, 238, "back-stripe"], [452, 345, "belly"], [684, 303, "tail-band-1"],
  [665, 335, "tail-band-2"], [733, 328, "tail-band-3"], [773, 328, "tail-tip"], [527, 333, "leg-near-hind"], [277, 238, "head"]
];

// Eye and fish-eye ink in the traced Explorer scene.
export const spinosaurusExplorerProtectedProbes: readonly (readonly [number, number])[] = [
  [256, 204], [137, 539]
];
