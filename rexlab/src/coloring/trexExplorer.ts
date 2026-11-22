import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const ink = "#091e40";
const region = (id: string, path: string, parent?: string, outline = 2.4): PaintRegion =>
  ({ id, x: 0, y: 0, path, outline, ...(parent ? { parent } : {}) });
const line = (path: string, strokeWidth = 1.4): ProtectedDetail =>
  ({ x: 0, y: 0, path, stroke: ink, strokeWidth });
const oval = (cx: number, cy: number, rx: number, ry: number) => {
  const k = 0.5523;
  return `M${cx - rx} ${cy} C${cx - rx} ${cy - ry * k} ${cx - rx * k} ${cy - ry} ${cx} ${cy - ry} ` +
    `C${cx + rx * k} ${cy - ry} ${cx + rx} ${cy - ry * k} ${cx + rx} ${cy} ` +
    `C${cx + rx} ${cy + ry * k} ${cx + rx * k} ${cy + ry} ${cx} ${cy + ry} ` +
    `C${cx - rx * k} ${cy + ry} ${cx - rx} ${cy + ry * k} ${cx - rx} ${cy} Z`;
};

// An Explorer T-Rex strides across a plain below a smoking volcano. It keeps the
// animal's own shape: a level back balanced by a long tapering tail, a deep
// skull with a heavy lower jaw, tiny two-fingered arms, a muscular thigh and a
// shin angled back to a three-toed foot. Curved stripes on its back, tail and
// thigh, its cheek, snout and belly are regions of their own, clipped to their
// parent, so an older child has many broad spaces to colour.
const regions: readonly PaintRegion[] = [
  region("sky", "M22 8 L438 8 Q450 8 450 20 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 L10 20 Q10 8 22 8 Z", undefined, 2),
  region("sun", oval(36, 34, 18, 18), undefined, 2),
  region("cloud-1", "M240 62 C226 61 226 45 239 43 C238 27 262 23 270 37 C282 31 296 38 296 49 Q312 51 309 61 Q274 68 240 62 Z", undefined, 2),
  region("cloud-2", "M330 34 C318 34 318 21 329 19 C329 6 348 4 354 15 C364 10 374 16 373 25 Q386 27 383 35 Q356 40 330 34 Z", undefined, 2),
  region("smoke", "M100 40 C88 38 86 26 98 24 C98 12 116 8 122 18 C130 10 146 14 144 26 C154 28 154 40 142 42 Z", undefined, 2),
  region("volcano", "M34 128 C66 104 86 74 100 46 L136 46 C150 74 170 104 204 128 Z", undefined, 2.2),
  region("lava", "M88 70 L100 46 L136 46 L148 70 C140 64 132 70 126 80 C120 68 106 62 88 70 Z", "volcano", 1.8),
  region("far-hills", "M190 130 C240 104 300 100 340 118 C380 100 420 98 450 108 L450 200 L190 200 Z", undefined, 2),
  region("hills", "M10 150 C60 128 110 132 150 142 C200 124 240 128 270 140 L270 230 L10 230 Z", undefined, 2),
  region("plain", "M10 206 Q100 194 200 204 Q300 214 450 198 L450 264 L10 264 Z", undefined, 2),
  region("pond", oval(130, 222, 52, 10), undefined, 2),
  region("ground", "M10 264 Q60 254 112 262 C170 270 228 258 290 264 Q360 270 450 256 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 Z", undefined, 2),
  region("tree-trunk", "M410 276 C412 240 412 200 410 130 L422 130 C422 200 424 240 430 276 Z", undefined, 2),
  region("tree-crown-1", "M376 214 C394 196 404 178 416 160 C428 178 438 196 452 212 C428 220 400 220 376 214 Z", undefined, 2),
  region("tree-crown-2", "M384 178 C398 162 406 146 416 128 C426 146 434 162 448 176 C428 184 404 184 384 178 Z", undefined, 2),
  region("tree-crown-3", "M392 142 C402 128 410 112 416 96 C422 112 430 128 440 140 C426 148 406 148 392 142 Z", undefined, 2),
  region("rock", "M22 294 Q22 272 40 262 Q58 252 76 264 L96 294 Q60 300 22 294 Z", undefined, 2.1),
  region("rock-face", "M52 252 L110 252 L110 302 L52 302 Z", "rock", 1.7),
  region("fern-1", "M112 298 C102 272 104 250 118 234 C122 256 132 272 144 282 C142 264 148 248 162 238 C168 260 168 282 160 298 Z", undefined, 2),
  region("fern-2", "M330 298 C324 280 328 262 338 250 C342 264 348 272 356 276 C360 262 368 252 380 246 C382 266 388 282 384 298 Z", undefined, 2),

  region("leg-far", "M268 192 L296 198 C296 216 290 232 284 244 L312 260 C326 262 338 264 342 270 Q342 276 334 276 L274 276 Q266 276 268 268 L262 242 C260 224 262 208 268 192 Z", undefined, 2.4),
  region("tail", "M180 110 C140 100 96 96 56 98 C40 99 26 102 14 108 C28 114 48 118 70 122 C110 130 150 148 188 174 Z", undefined, 2.8),
  region("tail-stripe-1", "M56 84 C62 102 64 124 60 152 C74 130 80 106 78 84 Z", "tail", 1.8),
  region("tail-stripe-2", "M98 84 C104 102 106 124 102 152 C116 130 122 106 120 84 Z", "tail", 1.8),
  region("tail-stripe-3", "M136 84 C142 102 144 124 140 152 C160 130 168 106 166 84 Z", "tail", 1.8),
  region("body", "M168 116 C196 96 250 92 292 98 C318 102 336 92 350 76 L380 96 C378 118 368 138 352 152 C338 168 318 182 296 190 C264 202 226 200 200 188 C180 178 168 160 166 144 C164 132 164 124 168 116 Z", undefined, 2.8),
  region("back-stripe-1", "M164 84 C170 104 172 126 166 150 C190 132 200 108 198 84 Z", "body", 1.8),
  region("back-stripe-2", "M258 80 C264 100 264 120 254 142 C276 128 286 104 284 80 Z", "body", 1.8),
  region("back-stripe-3", "M294 80 C300 100 300 120 290 142 C312 128 322 104 320 80 Z", "body", 1.8),
  region("back-stripe-4", "M326 70 C332 90 332 110 322 132 C344 118 354 94 352 70 Z", "body", 1.8),
  region("belly", "M160 168 C210 196 292 188 356 144 L380 240 L150 240 Z", "body", 1.8),
  region("leg-near", "M222 196 L252 202 C252 220 246 236 240 248 L268 264 C282 266 294 268 298 274 Q298 280 290 280 L230 280 Q222 280 224 272 L218 246 C216 228 218 212 222 196 Z", undefined, 2.7),
  region("thigh", "M196 116 C214 104 244 108 254 126 C262 144 256 168 246 188 C240 200 230 206 220 202 C208 194 200 178 196 162 C192 146 192 128 196 116 Z", undefined, 2.7),
  region("arm-far", "M312 154 C322 146 334 150 336 160 L340 172 C348 174 354 178 354 184 C348 186 342 184 338 182 C340 188 338 192 332 190 L326 182 C318 176 314 168 312 154 Z", undefined, 2.2),
  region("head", "M340 70 C348 56 362 48 380 46 C392 42 400 44 406 48 C420 50 434 54 442 60 C448 64 450 72 446 78 L444 86 L412 92 L388 96 L366 100 C354 102 344 96 340 88 C336 82 336 76 340 70 Z", undefined, 2.8),
  region("lower-jaw", "M362 98 L444 86 C448 94 442 100 430 104 C410 112 388 118 372 118 C358 116 354 104 362 98 Z", undefined, 2.6),
  region("arm-near", "M334 148 C342 142 352 146 354 154 L358 166 C366 168 372 172 372 176 C366 178 360 176 356 174 C358 180 356 184 350 182 L346 174 C340 170 336 162 334 148 Z", undefined, 2.4)
];

const details: readonly ProtectedDetail[] = [
  // A small eye under a heavy brow reads as an animal, not a cartoon.
  { x: 395, y: 57, width: 8, height: 5.5, rotation: 0, fill: "#ffffff", stroke: ink, strokeWidth: 1.4 },
  { x: 396.5, y: 57.2, width: 2, height: 4.6, rotation: 0, fill: ink },
  line("M386 52 Q397 44 410 51", 1.8),
  { x: 435, y: 63, width: 5, height: 3, rotation: -12, fill: ink },
  // Teeth, claws, toes, skin folds, scales, fern veins, cracks and grass are ink, not targets.
  line("M444 86 L441 91 L438 87 L433 92.5 L430 88.5 L425 94 L422 90 L417 95.5 L414 91.5 L409 97 L406 93 L401 98 L398 94 L393 99.5 L390 95.5 L385 101 L382 97 L377 102.5 L374 98.5", 1),
  line("M368 86 Q378 80 384 90 M352 92 Q358 98 356 106", 1.1),
  line("M372 176 L376 180 M356 182 L358 188 M356 182 L360 186 M340 188 L342 194", 1.2),
  line("M298 274 L304 278 M282 280 L286 284 M266 280 L268 285 M342 270 L348 274 M326 276 L330 280", 1.3),
  line("M240 248 L232 268 M284 244 L276 264", 1.1),
  line("M206 150 Q212 146 218 150 M300 160 Q306 156 312 160 M188 132 Q194 128 200 132 M120 106 Q126 102 132 106 M262 168 Q268 164 274 168", 1.1),
  line("M128 290 Q126 264 120 240 M128 270 L114 262 M128 258 L118 248 M150 288 Q152 262 160 240 M152 268 L164 262", 1.1),
  line("M356 296 Q356 276 340 254 M356 296 Q362 270 378 250 M348 278 L336 272 M364 274 L376 268", 1.1),
  line("M70 272 L80 276 M40 282 L50 284", 1.1),
  line("M190 240 Q200 236 210 240 M330 236 Q340 232 350 236 M60 248 Q70 242 80 248", 1.2)
];

// The third Explorer picture; saved journals resolve it.
export const TREX_EXPLORER_3: Geometry = {
  artwork: Object.freeze({ version: "trex-explorer-3", regions: Object.freeze(regions.map(({ id }) => id)) }),
  regions, details
};
