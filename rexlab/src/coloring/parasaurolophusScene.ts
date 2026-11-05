import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const ink = "#091e40";
const region = (id: string, path: string, parent?: string, outline = 2.4): PaintRegion =>
  ({ id, x: 0, y: 0, path, outline, ...(parent ? { parent } : {}) });
const line = (path: string, strokeWidth = 1.4): ProtectedDetail =>
  ({ x: 0, y: 0, path, stroke: ink, strokeWidth });

// A friendly Parasaurolophus: one flowing tail, back and neck, a long tube crest and a duck bill.
const farLegs = [
  region("leg-far-hind", "M246 206 L276 206 L276 262 L294 266 Q304 270 300 280 L250 280 Q240 280 242 270 Z", undefined, 2.2),
  region("arm-far", "M340 176 L360 168 L356 250 L368 262 Q372 272 364 276 L336 276 Q328 276 332 266 Z", undefined, 2.2)
];
const body = region("body", "M22 150 C70 120 120 104 176 102 C226 100 268 112 296 110 C316 108 328 92 338 70 L388 96 C384 130 366 160 340 186 C316 214 268 228 224 222 C186 216 160 196 130 182 C96 170 58 162 22 150 Z", undefined, 2.8);
const belly = region("belly", "M96 170 C140 176 170 192 224 198 C280 202 340 160 376 90 L420 90 L420 240 L96 240 Z", "body", 1.8);
const crest = region("crest", "M362 56 C338 40 304 26 268 20 C254 18 246 30 256 38 C288 48 320 66 340 84 Z", undefined, 2.6);
const bill = region("bill", "M404 60 C420 54 440 56 444 70 C446 86 432 98 408 100 Z", undefined, 2.6);
const head = region("head", "M334 74 C336 54 358 44 380 46 C398 48 410 56 414 66 C420 76 418 88 410 98 C396 106 376 110 360 106 C344 102 334 90 334 74 Z", undefined, 2.8);
const nearLegs = [
  region("leg-near-hind", "M168 170 C176 146 232 146 244 176 C250 204 238 232 226 248 L232 272 L258 275 Q270 280 264 292 L196 292 Q186 292 188 282 L192 246 C176 226 162 198 168 170 Z", undefined, 2.7),
  region("arm-near", "M296 186 Q312 176 326 190 L320 258 L334 270 Q340 280 332 284 L300 284 Q292 284 294 274 Z", undefined, 2.7)
];

const face: readonly ProtectedDetail[] = [
  { x: 368, y: 60, width: 14, height: 17, rotation: -6, fill: ink },
  { x: 371, y: 62, width: 5, height: 5.5, rotation: 0, fill: "#ffffff" },
  { x: 377, y: 70, width: 2.5, height: 3, rotation: 0, fill: "#ffffff" },
  { x: 430, y: 66, width: 4.5, height: 3, rotation: -10, fill: ink },
  // The smile and toes are ink, not small regions competing with a finger tap.
  line("M442 80 C424 88 404 92 384 92 Q374 90 368 84", 1.8),
  line("M244 292 L244 285 M254 292 L254 285 M312 284 L312 277 M322 284 L322 277", 1.4)
];

function scene(rich: boolean): Geometry {
  const regions: PaintRegion[] = [];
  if (rich) regions.push(
    region("sky", "M22 8 L438 8 Q450 8 450 20 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 L10 20 Q10 8 22 8 Z", undefined, 2),
    region("sun", "M402 30 C402 8 438 8 438 30 C438 52 402 52 402 30 Z", undefined, 2),
    region("cloud", "M158 72 C144 71 144 55 157 53 C156 37 180 33 188 47 C200 41 214 48 214 59 Q230 61 227 71 Q192 78 158 72 Z", undefined, 2),
    region("far-bank", "M10 172 C50 150 96 152 140 164 C210 150 300 144 370 158 C400 150 430 152 450 164 L450 214 L10 214 Z", undefined, 2),
    region("cypress-trunk", "M54 212 C64 170 68 130 66 96 L88 96 C86 130 92 170 104 212 Z", undefined, 2),
    region("cypress-crown", "M76 100 C44 100 24 84 30 64 C34 42 56 20 80 20 C106 22 126 42 128 64 C130 84 108 100 76 100 Z", undefined, 2),
    region("river", "M10 206 Q60 196 112 206 Q170 216 228 206 Q290 196 350 206 Q400 214 450 204 L450 262 L10 262 Z", undefined, 2),
    region("lily-pad", "M64 236 C64 222 88 216 112 218 C134 220 148 228 144 238 C138 248 114 252 92 250 C76 248 64 244 64 236 Z", undefined, 2)
  );
  regions.push(region("ground", rich
    ? "M10 262 Q60 248 112 258 C170 268 228 254 290 260 Q360 266 450 252 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 Z"
    : "M24 266 Q59 251 105 263 C162 271 197 252 242 260 Q283 268 324 260 Q385 248 437 268 Q448 282 435 297 Q385 306 329 299 Q275 306 219 300 Q161 306 110 298 Q60 304 25 290 Q18 280 24 266 Z", undefined, 2));
  if (!rich) regions.push(
    region("reed", "M372 286 C364 256 372 226 384 204 C388 224 392 232 398 240 C402 216 410 200 424 186 C424 216 428 252 420 286 Z", undefined, 2)
  );
  regions.push(...farLegs, body);
  if (rich) regions.push(
    region("tail-tip", "M10 140 L92 104 L102 150 L10 170 Z", "body", 1.8)
  );
  regions.push(belly);
  if (rich) regions.push(
    region("stripe-hip", "M126 92 L176 88 L160 146 Z", "body", 1.8),
    region("stripe-back", "M200 88 L250 92 L226 150 Z", "body", 1.8),
    region("stripe-shoulder", "M270 96 L322 96 L292 152 Z", "body", 1.8)
  );
  regions.push(crest);
  if (rich) regions.push(region("crest-tip", "M299.6 27.4 C289.4 24.3 278.8 21.8 268.0 20.0 C254 18 246 30 256 38 C267.2 41.5 278.4 46.0 289.1 51.1 Z", "crest", 1.8));
  regions.push(bill, head, ...nearLegs);
  if (rich) regions.push(
    region("reed-back", "M370 288 C362 240 368 190 390 146 C400 190 408 240 404 288 Z", undefined, 2),
    region("reed-front", "M402 292 C394 250 398 204 420 162 C426 204 432 250 426 292 Z", undefined, 2),
    region("cattail", "M428 134 C428 120 446 120 446 134 L446 176 C446 188 428 188 428 176 Z", undefined, 2),
    region("swamp-fern", "M30 296 C20 272 26 250 40 234 C44 252 50 258 58 262 C62 246 70 236 82 230 C84 250 92 270 84 296 Z", undefined, 2)
  );
  const details = [...face];
  if (rich) details.push(
    // Lily flower, spots, ripples, stems and veins stay protected linework, never tiny fill targets.
    line("M96 234 Q90 222 99 224 Q104 214 109 224 Q118 222 112 234 Z", 1.3),
    { x: 188, y: 124, width: 7, height: 6, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 278, y: 170, width: 6, height: 5, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 346, y: 112, width: 6, height: 5, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    line("M154 232 Q162 226 172 232 M152 248 Q160 242 170 248", 1.2),
    line("M50 60 Q60 50 72 56 M86 74 Q98 66 110 72 M56 84 Q66 78 76 84", 1.1),
    line("M387 280 Q384 220 389 164 M414 284 Q412 236 419 184", 1.1),
    line("M437 188 L437 262", 1.8),
    line("M40 284 Q40 262 42 246 M70 284 Q72 262 78 244", 1.1),
    line("M396 30 L390 30 M399 14 L394 10", 1.2)
  );
  return {
    artwork: Object.freeze({ version: rich ? "parasaurolophus-explorer-1" : "parasaurolophus-hatchling-1", regions: Object.freeze(regions.map(({ id }) => id)) }),
    regions, details
  };
}

export const PARASAUROLOPHUS_HATCHLING = scene(false);
export const PARASAUROLOPHUS_EXPLORER = scene(true);
