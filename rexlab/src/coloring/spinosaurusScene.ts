import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const ink = "#091e40";
const region = (id: string, path: string, parent?: string, outline = 2.4): PaintRegion =>
  ({ id, x: 0, y: 0, path, outline, ...(parent ? { parent } : {}) });
const line = (path: string, strokeWidth = 1.4): ProtectedDetail =>
  ({ x: 0, y: 0, path, stroke: ink, strokeWidth });

// A friendly Spinosaurus walks low on four legs: a tall rounded back sail, a long
// crocodile snout and a long tail, so its outline never reads as the upright T-Rex.
const farLegs = [
  region("leg-far-hind", "M200 214 L222 214 L224 262 L240 266 Q248 272 242 278 L206 278 Q198 278 200 270 Z", undefined, 2.2),
  region("leg-far-front", "M314 196 L334 190 L332 256 L344 262 Q350 270 342 274 L314 274 Q306 274 308 266 Z", undefined, 2.2)
];
const sail = region("sail", "M118 176 C120 130 132 98 152 82 Q162 68 178 68 Q190 52 206 54 Q222 44 238 56 Q254 58 262 76 Q278 88 284 106 C294 128 300 152 304 176 Z", undefined, 2.8);
const body = region("body", "M14 196 C40 182 80 176 120 172 C150 166 180 160 220 160 C256 160 282 166 300 172 C316 176 330 168 340 158 L356 178 C344 196 324 210 300 220 C270 236 230 240 196 234 C164 228 140 214 110 208 C80 204 46 206 14 196 Z", undefined, 2.8);
const belly = region("belly", "M150 212 C190 220 230 222 270 218 C300 214 326 200 346 178 L370 250 L150 250 Z", "body", 1.8);
const head = region("head", "M322 160 C322 138 344 126 364 128 C384 130 398 142 400 160 C402 180 388 194 364 194 C340 194 322 182 322 160 Z", undefined, 2.8);
const snout = region("snout", "M390 146 C412 146 432 152 446 160 C452 166 450 174 440 176 C424 180 408 182 392 182 Q384 164 390 146 Z", undefined, 2.6);
const nearLegs = [
  region("leg-near-hind", "M146 196 C152 176 196 176 204 200 C208 222 198 240 190 252 L194 270 L214 272 Q224 278 218 288 L160 288 Q150 288 152 278 L158 250 C148 234 142 214 146 196 Z", undefined, 2.7),
  region("leg-near-front", "M282 200 Q298 192 310 204 L304 266 L318 274 Q324 284 316 288 L286 288 Q278 288 280 278 Z", undefined, 2.7)
];

const face: readonly ProtectedDetail[] = [
  { x: 346, y: 144, width: 14, height: 17, rotation: -6, fill: ink },
  { x: 349, y: 146.5, width: 5, height: 4.5, rotation: 0, fill: "#ffffff" },
  { x: 434, y: 159, width: 4.5, height: 3, rotation: -10, fill: ink },
  // The smile, teeth and toes are ink, not small regions competing with a finger tap.
  line("M444 170 C424 172 404 172 388 170 Q380 168 376 164", 1.8),
  line("M404 171 L406 175 M418 171 L420 175 M432 170 L434 174", 1.2),
  line("M206 278 L206 272 M214 278 L214 272 M166 288 L166 281 M176 288 L176 281 M292 288 L292 281 M300 288 L300 281", 1.4)
];

function scene(rich: boolean): Geometry {
  const regions: PaintRegion[] = [];
  if (rich) regions.push(
    region("sky", "M22 8 L438 8 Q450 8 450 20 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 L10 20 Q10 8 22 8 Z", undefined, 2),
    region("sun", "M402 30 C402 8 438 8 438 30 C438 52 402 52 402 30 Z", undefined, 2),
    region("cloud", "M300 62 C286 61 286 45 299 43 C298 27 322 23 330 37 C342 31 356 38 356 49 Q372 51 369 61 Q334 68 300 62 Z", undefined, 2),
    region("far-bank", "M10 172 C50 150 96 152 140 164 C210 150 300 144 370 158 C400 150 430 152 450 164 L450 214 L10 214 Z", undefined, 2),
    region("cypress-trunk", "M54 212 C64 170 68 130 66 96 L88 96 C86 130 92 170 104 212 Z", undefined, 2),
    region("cypress-crown", "M76 100 C44 100 24 84 30 64 C34 42 56 20 80 20 C106 22 126 42 128 64 C130 84 108 100 76 100 Z", undefined, 2),
    region("river", "M10 206 Q60 196 112 206 Q170 216 228 206 Q290 196 350 206 Q400 214 450 204 L450 262 L10 262 Z", undefined, 2),
    region("lily-pad", "M64 236 C64 222 88 216 112 218 C134 220 148 228 144 238 C138 248 114 252 92 250 C76 248 64 244 64 236 Z", undefined, 2)
  );
  regions.push(region("ground", rich
    ? "M10 262 Q60 248 112 258 C170 268 228 254 290 260 Q360 266 450 252 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 Z"
    : "M24 266 Q59 251 105 263 C162 271 197 252 242 260 Q283 268 324 260 Q385 248 437 268 Q448 282 435 297 Q385 306 329 299 Q275 306 219 300 Q161 306 110 298 Q60 304 25 290 Q18 280 24 266 Z", undefined, 2));
  if (!rich) regions.push(region("rock", "M372 288 C366 268 380 252 404 250 C428 248 444 262 440 288 Z", undefined, 2));
  regions.push(...farLegs, sail);
  // Older levels split the sail into stripes; each band stays a broad target.
  if (rich) regions.push(
    region("sail-stripe-1", "M138 40 L170 40 L166 200 L138 200 Z", "sail", 1.8),
    region("sail-stripe-2", "M198 40 L232 40 L230 200 L200 200 Z", "sail", 1.8),
    region("sail-stripe-3", "M258 40 L290 40 L294 200 L262 200 Z", "sail", 1.8)
  );
  regions.push(body);
  if (rich) regions.push(region("tail-tip", "M10 150 L70 150 L70 230 L10 230 Z", "body", 1.8));
  regions.push(belly, head, snout, ...nearLegs);
  if (rich) regions.push(
    region("reed-back", "M372 290 C364 256 370 226 392 196 C406 226 416 256 410 290 Z", undefined, 2),
    region("reed-front", "M404 292 C396 262 400 230 424 198 C436 230 442 262 436 292 Z", undefined, 2),
    region("cattail", "M426 196 C426 182 448 182 448 196 L448 236 C448 250 426 250 426 236 Z", undefined, 2),
    region("swamp-fern", "M30 296 C20 272 26 250 40 234 C44 252 50 258 58 262 C62 246 70 236 82 230 C84 250 92 270 84 296 Z", undefined, 2)
  );
  const details = [...face];
  if (rich) details.push(
    // Lily flower, spots, sail spines, ripples, stems and veins stay protected linework.
    line("M96 234 Q90 222 99 224 Q104 214 109 224 Q118 222 112 234 Z", 1.3),
    { x: 222, y: 172, width: 7, height: 6, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 268, y: 186, width: 6, height: 5, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 180, y: 182, width: 6, height: 5, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    line("M186 64 L186 92 M216 54 L216 84 M246 64 L246 92", 1.1),
    line("M154 232 Q162 226 172 232 M118 262 Q126 256 136 262", 1.2),
    line("M50 60 Q60 50 72 56 M86 74 Q98 66 110 72 M56 84 Q66 78 76 84", 1.1),
    line("M392 284 Q390 250 392 216 M421 286 Q420 252 424 220", 1.1),
    line("M437 250 L437 290", 1.8),
    line("M40 284 Q40 262 42 246 M70 284 Q72 262 78 244", 1.1),
    line("M396 30 L390 30 M399 14 L394 10", 1.2)
  );
  return {
    artwork: Object.freeze({ version: rich ? "spinosaurus-explorer-1" : "spinosaurus-hatchling-1", regions: Object.freeze(regions.map(({ id }) => id)) }),
    regions, details
  };
}

export const SPINOSAURUS_HATCHLING = scene(false);
export const SPINOSAURUS_EXPLORER = scene(true);
