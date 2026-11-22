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

// An Explorer Spinosaurus wades a river and snaps at a leaping fish. It keeps
// the animal's own shape: a tall arched sail on a long low back, a long
// crocodile-like skull with a small crest, strong clawed arms and a deep
// paddle tail. The sail's rim and bands, the flank and tail stripes and the
// belly are regions of their own, clipped to their parent; the legs stand in
// the water, so an older child has many broad spaces to colour.
const regions: readonly PaintRegion[] = [
  region("sky", "M22 8 L438 8 Q450 8 450 20 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 L10 20 Q10 8 22 8 Z", undefined, 2),
  region("sun", oval(36, 32, 17, 17), undefined, 2),
  region("cloud-1", "M362 58 C350 58 350 45 361 43 C361 30 380 28 386 39 C396 34 406 40 405 49 Q418 51 415 59 Q388 64 362 58 Z", undefined, 2),
  region("cloud-2", "M124 40 C112 40 112 27 123 25 C123 12 142 10 148 21 C158 16 168 22 167 31 Q180 33 177 41 Q150 46 124 40 Z", undefined, 2),
  region("far-hills", "M10 140 C60 112 120 110 170 128 C220 104 290 100 340 118 C380 98 420 96 450 106 L450 210 L10 210 Z", undefined, 2),
  region("hills", "M10 172 C70 150 130 152 180 166 C240 150 330 152 450 166 L450 210 L10 210 Z", undefined, 2),
  region("fern-trunk", "M62 206 C66 170 68 130 66 98 L86 98 C86 130 90 170 96 206 Z", undefined, 2),
  region("frond-left", "M76 100 C58 76 32 78 14 100 C32 122 62 120 76 100 Z", undefined, 2),
  region("frond-right", "M78 100 C96 76 122 78 140 100 C122 122 92 120 78 100 Z", undefined, 2),
  region("frond-top", "M77 98 C56 82 58 56 77 38 C96 56 98 82 77 98 Z", undefined, 2),

  region("tail-fin", "M24 160 C36 138 58 128 82 130 C106 132 128 140 156 152 Z", undefined, 2.4),
  region("tail", "M164 150 C124 146 80 148 40 156 C28 158 18 162 12 168 C24 176 44 182 70 186 C100 190 130 194 166 200 Z", undefined, 2.8),
  region("tail-stripe-1", "M44 140 C50 160 50 180 40 200 C58 188 68 164 64 140 Z", "tail", 1.8),
  region("tail-stripe-2", "M84 140 C90 161 90 182 80 204 C100 191 110 166 106 140 Z", "tail", 1.8),
  region("tail-stripe-3", "M124 140 C130 161 130 182 120 204 C140 191 150 166 146 140 Z", "tail", 1.8),
  region("sail", "M162 152 C164 110 184 70 218 52 C244 40 276 44 298 62 C318 80 332 110 340 140 Z", undefined, 2.8),
  region("sail-rim", "M150 162 C156 118 182 82 220 70 C246 62 272 66 292 82 C310 98 322 120 330 162 L360 162 L360 20 L130 20 L130 162 Z", "sail", 1.8),
  region("sail-band-1", "M196 160 L188 30 L212 30 L222 160 Z", "sail", 1.8),
  region("sail-band-2", "M262 160 L268 30 L292 30 L286 160 Z", "sail", 1.8),
  region("body", "M150 150 C180 132 240 126 290 130 C320 132 340 128 356 116 L382 132 C376 150 364 164 346 176 C322 194 272 208 222 210 C188 210 162 200 152 186 C146 174 144 162 150 150 Z", undefined, 2.8),
  region("flank-stripe-1", "M206 124 C212 143 212 162 202 182 C222 170 232 147 228 124 Z", "body", 1.8),
  region("flank-stripe-2", "M250 124 C256 143 256 162 246 182 C266 170 276 147 272 124 Z", "body", 1.8),
  region("flank-stripe-3", "M294 122 C300 139 300 156 290 174 C310 164 320 143 316 122 Z", "body", 1.8),
  region("belly", "M156 190 C210 198 290 184 362 146 L380 240 L150 240 Z", "body", 1.8),
  region("thigh", "M176 168 C188 150 222 150 238 162 C250 176 248 194 242 212 L180 212 C172 196 170 182 176 168 Z", undefined, 2.6),
  region("arm-far", "M314 170 C324 164 336 168 338 178 L344 200 C350 202 356 206 354 212 L332 214 C326 208 324 198 322 190 C316 184 312 178 314 170 Z", undefined, 2.2),
  region("head", "M350 116 C354 98 370 86 390 86 L398 82 C402 78 408 78 410 84 C420 86 434 92 446 98 C454 104 454 112 446 114 L392 120 C376 124 358 124 352 120 C346 118 346 118 350 116 Z", undefined, 2.8),
  region("lower-jaw", "M378 118 L446 114 C452 120 446 128 432 128 C414 136 396 140 382 140 C370 138 368 122 378 118 Z", undefined, 2.4),
  region("arm-near", "M332 166 C342 160 354 164 356 174 L362 196 C370 198 376 202 374 210 L350 212 C344 206 342 196 340 188 C334 182 330 176 332 166 Z", undefined, 2.6),
  region("river", "M10 204 Q60 196 112 204 Q170 212 228 204 Q290 196 350 204 Q400 212 450 202 L450 264 L10 264 Z", undefined, 2),
  region("lily-1", "M34 236 C34 226 52 220 72 222 C90 224 100 230 98 238 C94 246 76 250 58 248 C44 246 34 242 34 236 Z", undefined, 2),
  region("lily-2", "M250 244 C250 234 266 230 282 231 C296 232 302 238 300 244 C296 252 282 254 268 253 C256 252 250 250 250 244 Z", undefined, 2),
  region("ground", "M10 264 Q60 254 112 262 C170 270 228 258 290 264 Q360 270 450 256 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 Z", undefined, 2),
  region("rock", "M150 296 C146 280 158 270 176 270 C194 270 204 282 200 296 Z", undefined, 2),
  region("fern", "M24 298 C16 278 22 258 34 246 C38 262 44 268 52 272 C56 258 64 248 76 242 C78 262 86 280 80 298 Z", undefined, 2),
  region("reed-1", "M402 272 C396 248 402 226 416 206 C430 226 436 250 430 272 Z", undefined, 2),
  region("reed-2", "M424 274 C420 252 424 232 440 216 C452 234 454 256 450 274 Z", undefined, 2),
  region("fish-tail", "M394 172 L370 154 L372 190 Z", undefined, 2),
  region("fish", "M388 172 C398 154 420 148 440 152 C450 156 450 168 440 174 C424 184 402 186 388 172 Z", undefined, 2.2)
];

const details: readonly ProtectedDetail[] = [
  // A small eye with a slit pupil under a low crest reads as an animal, not a cartoon.
  { x: 384, y: 103, width: 8, height: 5.5, rotation: 0, fill: "#ffffff", stroke: ink, strokeWidth: 1.4 },
  { x: 385.5, y: 103.2, width: 2, height: 4.6, rotation: 0, fill: ink },
  line("M376 98 Q386 92 396 98", 1.6),
  { x: 420, y: 99, width: 4, height: 2.6, rotation: -10, fill: ink },
  // Teeth, sail spines, claws, scales, fish eye and fin, ripples and plants are ink, not targets.
  line("M446 112 L443 116.5 L440 112.6 L435 117.1 L432 113.19999999999999 L427 117.7 L424 113.8 L419 118.3 L416 114.39999999999999 L411 118.9 L408 115.0 L403 119.5 L400 115.6 L395 120.1 L392 116.19999999999999 L387 120.7 L384 116.8", 1),
  line("M186 136 L180 80 M224 132 L222 58 M250 130 L252 50 M276 130 L284 56 M306 130 L314 84", 1.1),
  line("M372 210 L378 214 M352 212 L356 218 M354 212 L358 216", 1.2),
  line("M200 168 Q206 164 212 168 M248 176 Q254 172 260 176 M300 168 Q306 164 312 168 M100 166 Q106 162 112 166", 1.1),
  { x: 434, y: 159, width: 4, height: 4, rotation: 0, fill: ink },
  line("M418 166 Q414 174 406 176 M410 156 Q416 152 424 154", 1.1),
  line("M140 212 Q152 206 164 212 M236 214 Q248 208 260 214 M322 214 Q334 208 346 214 M362 214 Q374 208 386 214", 1.2),
  line("M58 228 L66 236 M276 236 L274 244", 1.1),
  line("M40 290 Q40 268 42 256 M66 290 Q68 266 74 252", 1.1),
  line("M22 100 Q46 104 72 100 M132 100 Q108 104 82 100 M77 48 L77 92", 1.1),
  line("M418 266 L418 220 M440 268 L440 230", 1.1),
  line("M164 284 L174 278 L184 282", 1.2)
];

export const SPINOSAURUS_EXPLORER: Geometry = {
  artwork: Object.freeze({ version: "spinosaurus-explorer-3", regions: Object.freeze(regions.map(({ id }) => id)) }),
  regions, details
};
