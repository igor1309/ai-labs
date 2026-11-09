// Interior taps in canvas coordinates, including every environment and animal
// region. These are away from protected lines, so fills have an exact color.
export const explorerProbes: readonly (readonly [number, number, string])[] = [
  [136, 76, "sun"], [290, 96, "cloud"], [470, 188, "ridge"], [468, 116, "ridge-cap"],
  [100, 550, "meadow"], [650, 558, "stream"], [180, 354, "tail"],
  [354, 494, "rear-far"], [596, 478, "front-far"], [380, 300, "body"], [424, 370, "flank"],
  [278, 276, "back-band-1"], [370, 266, "back-band-2"], [454, 278, "back-band-3"],
  [292, 438, "rear-near"], [530, 474, "front-near"], [552, 224, "frill"],
  [592, 376, "frill-panel-low"], [572, 284, "frill-panel-left"], [602, 206, "frill-panel-crown"], [686, 202, "frill-panel-high"],
  [770, 374, "head"], [698, 394, "cheek"], [824, 410, "beak"],
  [702, 264, "horn-far"], [770, 294, "horn-near"], [844, 340, "horn-nose"],
  [132, 402, "cycad-trunk"], [66, 276, "cycad-left-low"], [78, 186, "cycad-left-high"],
  [116, 180, "cycad-crown"], [170, 198, "cycad-right-high"], [174, 260, "cycad-right-low"],
  [768, 528, "fern-left"], [822, 506, "fern-crown"], [856, 536, "fern-right"], [472, 552, "rock"]
];
