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
// animal's own proportions: a level back balanced by a long thick tail, a deep
// skull with a heavy lower jaw, tiny two-fingered arms and strong legs. Stripes on
// its back and tail, its brow, jaw muscle and hip are regions of their own, clipped
// to their parent, so an older child has many broad spaces to colour.
const regions: readonly PaintRegion[] = [
  region("sky", "M22 8 L438 8 Q450 8 450 20 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 L10 20 Q10 8 22 8 Z", undefined, 2),
  region("sun", oval(36, 36, 18, 18), undefined, 2),
  region("cloud-1", "M240 62 C226 61 226 45 239 43 C238 27 262 23 270 37 C282 31 296 38 296 49 Q312 51 309 61 Q274 68 240 62 Z", undefined, 2),
  region("cloud-2", "M384 40 C372 40 372 27 383 25 C383 12 402 10 408 21 C418 16 428 22 427 31 Q440 33 437 41 Q410 46 384 40 Z", undefined, 2),
  region("smoke", oval(122, 40, 24, 14), undefined, 2),
  region("volcano", "M56 152 L98 60 L144 60 L192 152 Z", undefined, 2.2),
  region("lava", "M84 90 L98 60 L144 60 L158 90 L140 82 L122 92 L102 82 Z", "volcano", 1.8),
  region("ridge", "M10 160 C60 130 100 140 140 150 C200 120 260 124 300 140 C340 120 400 118 450 140 L450 230 L10 230 Z", undefined, 2),
  region("plain", "M10 210 Q100 196 200 206 Q300 216 450 200 L450 264 L10 264 Z", undefined, 2),
  region("pond", oval(318, 240, 40, 14), undefined, 2),
  region("ground", "M10 264 Q60 254 112 262 C170 270 228 258 290 264 Q360 270 450 256 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 Z", undefined, 2),
  region("rock", "M40 284 Q42 266 60 258 Q72 252 86 264 L100 286 Q70 294 40 284 Z", undefined, 2.1),
  region("rock-face", "M62 254 L112 254 L112 300 L62 300 Z", "rock", 1.7),
  region("fern", "M124 298 C116 278 122 258 134 246 C138 262 144 268 152 272 C156 258 164 248 176 242 C178 262 186 280 180 298 Z", undefined, 2),
  region("cycad-trunk", "M404 272 Q410 230 406 190 L420 190 Q426 230 424 272 Z", undefined, 2),
  region("cycad-left", "M410 194 C388 204 366 196 362 178 C382 168 404 176 410 194 Z", undefined, 2),
  region("cycad-crown", "M412 190 C396 178 396 152 410 142 C428 152 430 176 412 190 Z", undefined, 2),
  region("cycad-right", "M414 194 C418 178 436 166 450 172 C450 192 432 202 414 194 Z", undefined, 2),

  region("leg-far", "M258 170 C276 160 296 176 292 196 L286 230 L282 262 L300 268 Q306 276 298 280 L262 280 Q254 280 256 272 L262 240 C252 220 248 186 258 170 Z", undefined, 2.4),
  region("tail", "M212 112 C170 100 110 86 28 92 Q20 96 28 104 C100 120 160 150 214 176 Z", undefined, 2.8),
  region("tail-stripe-1", "M60 86 L78 86 L86 132 L68 132 Z", "tail", 1.8),
  region("tail-stripe-2", "M108 88 L128 88 L136 142 L116 142 Z", "tail", 1.8),
  region("tail-stripe-3", "M158 96 L178 96 L186 162 L166 162 Z", "tail", 1.8),
  region("body", "M196 116 C230 100 280 98 310 106 C330 110 342 102 350 94 L376 114 C366 140 350 160 330 176 C300 200 260 206 230 200 C210 196 196 180 192 160 C190 140 190 124 196 116 Z", undefined, 2.8),
  region("back-stripe-1", "M230 94 L248 94 L242 136 L224 136 Z", "body", 1.8),
  region("back-stripe-2", "M268 92 L286 92 L282 134 L264 134 Z", "body", 1.8),
  region("back-stripe-3", "M304 94 L322 94 L318 130 L300 130 Z", "body", 1.8),
  region("belly", "M204 182 C250 184 296 168 330 144 L372 220 L200 220 Z", "body", 1.8),
  region("arm-far", "M300 158 Q316 150 326 162 L330 182 Q330 190 322 188 L314 184 Q306 178 304 172 Z", undefined, 2.2),
  region("leg-near", "M206 204 L236 202 L232 262 L254 268 Q262 276 254 282 L206 282 Q198 282 200 274 L208 256 Z", undefined, 2.7),
  region("thigh", "M180 160 C186 134 230 128 248 150 C262 170 256 200 236 214 C220 222 196 216 186 200 C178 188 176 174 180 160 Z", undefined, 2.7),
  region("hip-patch", oval(206, 160, 18, 13), "thigh", 1.8),
  region("head", "M346 86 C352 68 372 58 396 58 C420 58 440 64 448 76 Q452 86 446 96 C440 104 430 108 416 110 L370 116 C358 116 348 108 346 98 Z", undefined, 2.8),
  region("brow", "M340 50 L452 50 L452 76 C430 74 410 72 390 74 C372 76 356 82 340 94 Z", "head", 1.8),
  region("jaw-muscle", oval(366, 100, 14, 10), "head", 1.8),
  region("lower-jaw", "M372 110 C392 110 420 108 440 102 Q448 110 440 118 C420 128 394 132 372 128 C362 124 362 114 372 110 Z", undefined, 2.6),
  region("arm-near", "M322 144 Q342 136 350 152 L356 172 Q358 180 350 180 L344 178 Q336 176 334 168 L324 160 Q316 152 322 144 Z", undefined, 2.4)
];

const details: readonly ProtectedDetail[] = [
  // A small eye under a heavy brow reads as an animal, not a cartoon.
  { x: 394, y: 76, width: 10, height: 7, rotation: 0, fill: "#ffffff", stroke: ink, strokeWidth: 1.4 },
  { x: 398, y: 76.5, width: 2.4, height: 6, rotation: 0, fill: ink },
  { x: 438, y: 76, width: 5, height: 3, rotation: -12, fill: ink },
  // Teeth, claws, fingers, scales, cracks, fronds and grass are ink, not targets.
  line("M384 110 L386 116 M396 110 L398 116 M408 109 L410 115 M420 107 L422 113 M432 104 L433 110 M390 116 L392 112 M414 114 L416 110", 1.1),
  line("M346 172 L350 178 M352 170 L356 176", 1.2),
  line("M222 272 L222 282 M238 272 L238 282 M276 270 L276 280 M290 272 L290 280", 1.3),
  line("M252 150 Q258 146 264 150 M290 148 Q296 144 302 148 M220 180 Q226 176 232 180 M200 128 Q206 124 212 128 M140 120 Q146 116 152 120", 1.1),
  line("M70 272 L80 276", 1.1),
  line("M408 210 L420 210 M408 232 L422 232 M408 252 L422 252", 1.1),
  line("M130 290 Q130 268 132 256 M158 290 Q160 266 166 252", 1.1),
  line("M290 240 Q300 236 310 240 M324 244 Q334 240 344 244 M60 236 Q70 230 80 236 M180 230 Q190 224 200 230", 1.2)
];

export const TREX_EXPLORER: Geometry = {
  artwork: Object.freeze({ version: "trex-explorer-2", regions: Object.freeze(regions.map(({ id }) => id)) }),
  regions, details
};
