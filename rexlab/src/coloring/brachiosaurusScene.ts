import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const ink = "#091e40";
const region = (id: string, path: string, parent?: string, outline = 2.4): PaintRegion =>
  ({ id, x: 0, y: 0, path, outline, ...(parent ? { parent } : {}) });
const line = (path: string, strokeWidth = 1.4): ProtectedDetail =>
  ({ x: 0, y: 0, path, stroke: ink, strokeWidth });

// A friendly Brachiosaurus: a long neck reaching up, tall front legs and a sloping back.
const sauropod = [
  region("tail", "M178 150 C140 160 104 180 76 202 C58 216 40 230 24 240 C48 248 82 238 112 224 C138 212 160 206 184 208 Z", undefined, 2.6),
  region("leg-far-hind", "M212 196 L250 200 L248 270 Q248 278 240 278 L220 278 Q212 278 212 270 Z", undefined, 2.2),
  region("leg-far-front", "M300 186 L334 178 L334 268 Q334 276 326 276 L308 276 Q300 276 300 268 Z", undefined, 2.2),
  region("neck", "M282 124 C298 96 328 68 356 48 L394 64 C366 88 346 116 334 150 Q306 146 282 124 Z", undefined, 2.6),
  region("body", "M166 172 C166 146 200 128 240 120 C276 112 318 106 334 136 C346 164 330 210 284 222 C238 230 194 224 174 206 Q162 192 166 172 Z", undefined, 2.8),
  region("head", "M350 50 C348 34 360 22 378 22 Q386 12 398 18 C406 24 406 30 405 34 C422 34 438 40 440 50 C442 60 430 68 412 68 Q392 72 376 70 C360 68 352 60 350 50 Z", undefined, 2.8),
  region("leg-near-hind", "M174 196 Q194 184 216 196 L216 282 Q216 290 208 290 L182 290 Q174 290 174 282 Z", undefined, 2.7),
  region("leg-near-front", "M264 194 Q286 182 308 194 L308 282 Q308 290 300 290 L272 290 Q264 290 264 282 Z", undefined, 2.7)
];

const faceAndFeet: readonly ProtectedDetail[] = [
  { x: 380, y: 34, width: 14, height: 17, rotation: -6, fill: ink },
  { x: 383, y: 36, width: 5, height: 5.5, rotation: 0, fill: "#ffffff" },
  { x: 389, y: 44, width: 2.5, height: 3, rotation: 0, fill: "#ffffff" },
  { x: 429, y: 43, width: 4.5, height: 3, rotation: -10, fill: ink },
  line("M376 30 Q386 24 396 29", 1.8),
  // The smile, toes and knees are ink, not small regions competing with a finger tap.
  line("M438 56 C420 62 400 63 384 60 Q378 58 376 54", 1.8),
  line("M180 290 L180 283 M190 290 L190 283 M200 290 L200 283 M270 290 L270 283 M281 290 L281 283 M292 290 L292 283", 1.4),
  line("M218 278 L218 272 M230 278 L230 272 M306 276 L306 270 M318 276 L318 270", 1.2),
  line("M182 240 Q195 246 208 240 M272 238 Q286 244 300 238", 1.4)
];

function fern(rich: boolean): { regions: PaintRegion[]; details: ProtectedDetail[] } {
  const regions = [
    region("fern-left", "M384 286 C348 290 326 268 328 236 C360 228 390 252 384 286 Z", undefined, 2),
    region("fern-crown", "M388 285 C358 262 360 220 388 198 C416 218 418 262 388 285 Z", undefined, 2),
    region("fern-right", "M392 286 C388 250 414 228 440 234 C446 264 424 292 392 286 Z", undefined, 2)
  ];
  const details = [line("M356 254 Q372 264 386 282 Q389 254 388 228 M390 282 Q404 266 422 256", 1.1)];
  if (rich) details.push(line("M362 258 L362 250 M372 266 L374 256 M384 244 L380 238 M390 248 L396 242 M406 264 L414 258 M418 258 L420 250", 1));
  return { regions, details };
}

function tree(): { regions: PaintRegion[]; details: ProtectedDetail[] } {
  // Tall conifers the Brachiosaurus could browse; bark lines are protected ink.
  return {
    regions: [
      region("tree-trunk", "M70 264 Q78 190 72 108 L90 108 Q96 190 92 264 Z", undefined, 2),
      region("tree-low", "M80 150 C50 150 28 136 28 118 C46 106 64 104 80 100 C96 104 116 106 134 118 C134 136 112 150 80 150 Z", undefined, 2),
      region("tree-top", "M80 100 C56 98 40 84 44 66 C56 52 66 30 80 18 C94 30 104 52 116 66 C120 84 104 98 80 100 Z", undefined, 2),
      region("tree-right-trunk", "M412 264 Q418 210 414 150 L430 150 Q436 210 432 264 Z", undefined, 2),
      region("tree-right-crown", "M422 156 C402 156 390 142 394 124 C400 108 410 94 422 82 C434 94 442 108 444 124 C446 142 438 156 422 156 Z", undefined, 2)
    ],
    details: [line("M76 160 L82 168 M84 196 L78 204 M78 232 L86 240 M418 188 L424 194 M424 222 L418 228 M50 128 Q80 134 112 126 M58 76 Q80 84 102 74 M402 132 Q422 138 440 130", 1.1)]
  };
}

function scene(rich: boolean): Geometry {
  const plant = fern(rich);
  const trees = tree();
  const regions: PaintRegion[] = [];
  if (rich) regions.push(
    region("sun", "M150 46 C150 24 184 24 184 46 C184 68 150 68 150 46 Z", undefined, 2),
    region("cloud", "M206 66 C192 65 192 49 205 47 C204 31 228 27 236 41 C248 35 262 42 262 53 Q278 55 275 65 Q240 72 206 66 Z", undefined, 2),
    region("hills", "M22 196 C52 168 90 166 124 174 C160 182 184 160 220 164 C262 170 300 150 350 156 Q404 150 438 182 L438 274 L22 274 Z", undefined, 2)
  );
  regions.push(region("ground", "M24 266 Q59 251 105 263 C162 271 197 252 242 260 Q283 268 324 260 Q385 248 437 268 Q448 282 435 297 Q385 306 329 299 Q275 306 219 300 Q161 306 110 298 Q60 304 25 290 Q18 280 24 266 Z", undefined, 2));
  if (rich) regions.push(...trees.regions);
  const markings = rich ? [
    region("tail-mark", "M116 192 Q134 180 154 174 L160 204 Q140 208 122 216 Z", "tail", 1.8),
    region("back-mark", "M200 140 C220 126 246 120 270 122 Q266 142 246 150 Q220 158 200 140 Z", "body", 1.8),
    region("belly", "M188 192 C228 202 284 200 324 176 Q326 198 306 210 C266 224 222 222 190 210 Z", "body", 1.8)
  ] : [];
  // Markings sit on their own skin surface, behind the foreground legs and head.
  for (const part of sauropod) regions.push(part, ...markings.filter(({ parent }) => parent === part.id));
  if (rich) regions.push(
    region("rock", "M100 290 Q100 266 124 254 Q142 246 158 262 L176 290 Q138 298 100 290 Z", undefined, 2.1),
    region("rock-face", "M126 258 Q144 254 156 266 L172 288 L134 292 Z", "rock", 1.7)
  );
  regions.push(...plant.regions);
  const details = [...faceAndFeet, ...plant.details,
    line("M44 288 Q56 284 64 288 M226 294 Q238 290 248 293 M330 291 L333 283 M333 291 L340 286", 1.2)
  ];
  if (rich) details.push(
    ...trees.details,
    // Skin spots and sun rays stay protected linework, never tiny fill targets.
    { x: 222, y: 168, width: 7, height: 6, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 246, y: 176, width: 6, height: 5, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 290, y: 160, width: 7, height: 6, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 318, y: 104, width: 6, height: 5, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 340, y: 80, width: 5, height: 4, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    line("M378 28 Q388 18 398 22", 1.3),
    line("M167 18 L167 10 M196 46 L204 46 M138 46 L130 46 M188 26 L194 20 M146 26 L140 20", 1.2),
    line("M120 282 L128 276 M146 286 L154 280", 1.1)
  );
  return {
    artwork: Object.freeze({ version: rich ? "brachiosaurus-explorer-1" : "brachiosaurus-hatchling-1", regions: Object.freeze(regions.map(({ id }) => id)) }),
    regions, details
  };
}

export const BRACHIOSAURUS_HATCHLING = scene(false);
export const BRACHIOSAURUS_EXPLORER = scene(true);
