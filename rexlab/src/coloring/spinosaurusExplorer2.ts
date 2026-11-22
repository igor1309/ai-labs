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

// Saved journals still resolve this version; new Explorer works use spinosaurusExplorer.ts.
// An Explorer Spinosaurus wades a river with a fish leaping at its jaws. It keeps the
// animal's own proportions: a long low body, short hind legs, a finned paddle tail,
// a tall sail and a narrow crocodile snout. Its sail, flank and tail carry patterns
// that are regions of their own, clipped to their parent, so an older child has many
// broad spaces to colour without any tiny target.
const regions: readonly PaintRegion[] = [
  region("sky", "M22 8 L438 8 Q450 8 450 20 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 L10 20 Q10 8 22 8 Z", undefined, 2),
  region("sun", oval(418, 40, 20, 20), undefined, 2),
  region("cloud-1", "M300 62 C286 61 286 45 299 43 C298 27 322 23 330 37 C342 31 356 38 356 49 Q372 51 369 61 Q334 68 300 62 Z", undefined, 2),
  region("cloud-2", "M130 50 C118 50 118 37 129 35 C129 22 148 20 154 31 C164 26 174 32 173 41 Q186 43 183 51 Q156 56 130 50 Z", undefined, 2),
  region("hills", "M10 150 C60 118 110 120 150 140 C200 112 260 108 300 128 C340 104 400 104 450 130 L450 210 L10 210 Z", undefined, 2),
  region("cypress-trunk", "M68 210 C74 170 76 120 74 86 L90 86 C88 120 92 170 100 210 Z", undefined, 2),
  region("cypress-crown", oval(82, 62, 48, 34), undefined, 2),
  region("river", "M10 204 Q60 196 112 204 Q170 212 228 204 Q290 196 350 204 Q400 212 450 202 L450 264 L10 264 Z", undefined, 2),
  region("lily-1", "M34 236 C34 224 54 218 74 220 C92 222 104 230 100 238 C96 246 76 250 58 248 C44 246 34 242 34 236 Z", undefined, 2),
  region("lily-2", "M250 244 C250 234 266 230 280 231 C294 232 300 238 298 244 C294 252 280 254 268 253 C256 252 250 250 250 244 Z", undefined, 2),
  region("ground", "M10 264 Q60 254 112 262 C170 270 228 258 290 264 Q360 270 450 256 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 Z", undefined, 2),
  region("rock", "M240 296 C236 280 248 270 266 270 C284 270 294 282 290 296 Z", undefined, 2),
  region("fern", "M24 298 C16 278 22 258 34 246 C38 262 44 268 52 272 C56 258 64 248 76 242 C78 262 86 280 80 298 Z", undefined, 2),
  region("reed-1", "M408 270 C402 248 406 230 418 212 C428 232 432 250 426 270 Z", undefined, 2),
  region("reed-2", "M428 272 C424 252 428 236 440 222 C448 240 450 258 446 272 Z", undefined, 2),

  region("leg-far-hind", "M226 200 L246 200 L248 256 L262 260 Q268 266 262 270 L232 270 Q224 270 226 262 Z", undefined, 2.2),
  region("arm-far", "M298 190 L314 188 L316 230 L328 236 Q332 244 322 244 L302 244 Q296 244 298 236 Z", undefined, 2.2),
  region("tail-fin", "M24 174 Q34 158 46 156 Q56 144 70 144 Q82 134 96 138 Q110 136 120 146 Q136 148 146 156 L160 164 Z", undefined, 2.6),
  region("tail", "M166 160 C120 158 70 160 18 172 Q12 178 20 182 C70 190 120 198 166 202 Z", undefined, 2.8),
  region("tail-band-1", "M36 150 L54 150 L56 210 L38 210 Z", "tail", 1.8),
  region("tail-band-2", "M76 150 L96 150 L98 210 L78 210 Z", "tail", 1.8),
  region("tail-band-3", "M118 150 L138 150 L140 210 L120 210 Z", "tail", 1.8),
  region("sail", "M150 166 C152 130 160 90 178 66 Q190 58 200 62 Q214 46 230 48 Q246 40 262 52 Q278 52 288 68 C302 96 316 130 326 160 Z", undefined, 2.8),
  region("sail-edge", "M140 20 L340 20 L340 160 C320 112 298 80 262 70 Q246 60 230 66 Q210 66 196 80 C176 96 160 126 140 166 Z", "sail", 1.8),
  region("sail-band-1", "M186 170 L178 20 L206 20 L210 170 Z", "sail", 1.8),
  region("sail-band-2", "M236 170 L234 20 L264 20 L262 170 Z", "sail", 1.8),
  region("sail-band-3", "M290 170 L298 20 L330 20 L314 170 Z", "sail", 1.8),
  region("body", "M150 166 C180 148 230 146 280 148 C306 148 326 140 338 128 L362 140 C354 166 340 186 318 200 C290 214 240 220 200 214 C176 210 158 198 150 186 Z", undefined, 2.8),
  region("flank-stripe-1", "M196 140 L216 140 L210 180 L190 180 Z", "body", 1.8),
  region("flank-stripe-2", "M240 140 L260 140 L254 180 L234 180 Z", "body", 1.8),
  region("flank-stripe-3", "M284 138 L304 138 L296 176 L276 176 Z", "body", 1.8),
  region("belly", "M160 194 C214 202 280 198 334 170 L350 240 L150 240 Z", "body", 1.8),
  region("head", "M330 126 C338 112 356 106 374 108 C392 110 408 118 424 124 C436 128 446 130 450 134 Q450 140 442 141 L400 142 C380 150 352 152 338 146 C328 140 324 134 330 126 Z", undefined, 2.8),
  region("snout", "M404 96 L452 96 L452 160 L404 160 Z", "head", 1.8),
  region("lower-jaw", "M384 140 C404 144 424 144 442 141 Q450 150 438 155 C418 162 398 162 382 157 Z", undefined, 2.4),
  region("foot-near", "M182 214 L206 212 L210 258 L230 264 Q236 272 228 276 L184 276 Q176 276 178 268 Z", undefined, 2.7),
  region("thigh", "M160 196 C158 178 176 166 196 168 C214 170 222 186 216 204 C212 218 204 226 194 228 L182 228 C168 222 162 210 160 196 Z", undefined, 2.7),
  region("arm-near", "M318 186 Q334 182 340 194 L334 236 L346 242 Q350 250 342 252 L318 252 Q310 252 314 244 Z", undefined, 2.7),
  region("fish-tail", "M406 196 L372 220 L374 178 Z", undefined, 2),
  region("fish", "M398 196 C406 180 424 168 444 166 Q450 170 446 176 C436 192 420 200 402 203 Z", undefined, 2.2)
];

const details: readonly ProtectedDetail[] = [
  // A small eye with a slit pupil reads as an animal, not a cartoon.
  { x: 366, y: 118, width: 10, height: 7, rotation: 0, fill: "#ffffff", stroke: ink, strokeWidth: 1.4 },
  { x: 370, y: 118.5, width: 2.4, height: 6, rotation: 0, fill: ink },
  line("M362 116 Q371 110 380 115", 1.6),
  { x: 430, y: 128, width: 5, height: 3, rotation: -12, fill: ink },
  // Teeth, claws, sail spines, scales, fish eye and fin, water and plants are ink, not targets.
  line("M398 142 L400 146 M408 142 L410 146 M418 142 L420 146 M428 142 L430 145", 1.1),
  line("M206 268 L212 274 M218 268 L224 274 M190 268 L190 276 M252 262 L258 268 M330 244 L334 250 M340 244 L344 250 M314 236 L316 242", 1.3),
  line("M222 150 L220 62 M276 150 L280 64", 1.1),
  line("M170 176 Q176 172 182 176 M220 168 Q226 164 232 168 M178 190 Q184 186 190 190", 1.1),
  { x: 432, y: 171, width: 4, height: 4, rotation: 0, fill: ink },
  line("M418 182 Q422 190 414 196", 1.1),
  line("M372 214 Q382 208 392 214 M356 226 Q366 220 376 226 M120 226 Q132 220 144 226 M200 236 Q212 230 224 236", 1.2),
  line("M58 228 L70 236 M268 236 L276 242", 1.1),
  line("M40 290 Q40 268 42 256 M66 290 Q68 266 74 252", 1.1),
  line("M60 50 Q72 42 84 48 M84 70 Q96 62 108 68 M56 74 Q66 68 76 74", 1.1),
  line("M252 284 L262 278 L272 282", 1.2)
];

export const SPINOSAURUS_EXPLORER_2: Geometry = {
  artwork: Object.freeze({ version: "spinosaurus-explorer-2", regions: Object.freeze(regions.map(({ id }) => id)) }),
  regions, details
};
