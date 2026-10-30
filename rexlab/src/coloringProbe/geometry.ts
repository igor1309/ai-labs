// Coordinates and region IDs are part of the saved document contract.
export const GEOMETRY = "stegosaurus-1";
export const WIDTH = 1024;
export const HEIGHT = 768;
export const BASE = "#fff0cf";
export const COLORS = [BASE, "#ef5350", "#ff9345", "#ffd84a", "#9ccc65", "#26a69a", "#42a5f5", "#536dce", "#ab67cb", "#f78fbd", "#875c45", "#3c4358"] as const;
export const SIZES = [8, 20, 40] as const;
export type Point = { x: number; y: number };

// Regions tile along shared edges; none overlaps another's interior.
export const REGIONS = [
  { id: "body", path: "M 210 390 Q 214 345 230 320 Q 254 292 290 276 Q 330 253 380 245 Q 435 244 485 257 Q 530 268 570 290 Q 598 306 620 332 Q 644 352 660 382 L 670 400 L 740 450 Q 800 475 850 480 L 883 476 L 893 474 L 928 463 Q 950 455 970 440 Q 920 530 750 515 L 655 480 L 650 620 Q 625 650 575 630 L 550 510 Q 465 565 360 525 L 330 640 Q 285 665 240 640 L 265 485 L 210 450 Z" },
  { id: "head", path: "M 210 390 C 170 330 120 345 95 390 Q 45 405 65 450 Q 110 490 210 450 Z" },
  { id: "plate-1", path: "M 230 320 Q 190 275 210 220 Q 270 235 290 276 Q 254 292 230 320 Z" },
  { id: "plate-2", path: "M 290 276 Q 255 205 295 145 Q 365 170 380 245 Q 330 253 290 276 Z" },
  { id: "plate-3", path: "M 380 245 Q 355 155 420 95 Q 490 150 485 257 Q 435 244 380 245 Z" },
  { id: "plate-4", path: "M 485 257 Q 500 180 555 160 Q 600 220 570 290 Q 530 268 485 257 Z" },
  { id: "plate-5", path: "M 570 290 Q 600 230 650 240 Q 675 300 620 332 Q 598 306 570 290 Z" },
  { id: "plate-6", path: "M 620 332 Q 680 330 710 350 Q 715 380 660 382 Q 644 352 620 332 Z" },
  { id: "spike-1", path: "M 850 480 L 900 380 L 883 476 Z" },
  { id: "spike-2", path: "M 893 474 L 970 370 L 928 463 Z" }
] as const;
export type Region = typeof REGIONS[number]["id"];
export const DETAILS = { eye: { x: 144, y: 404, radius: 12 }, smile: "M 83 446 Q 126 462 164 440", toes: "M 258 630 L 263 615 M 284 638 L 289 621 M 307 638 L 312 619 M 587 626 L 589 610 M 612 633 L 614 614 M 635 628 L 635 609" };
