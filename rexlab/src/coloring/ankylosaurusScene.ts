import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const ink = "#091e40";
const region = (id: string, path: string, parent?: string, outline = 2.2): PaintRegion =>
  ({ id, x: 0, y: 0, path, outline, ...(parent ? { parent } : {}) });
const line = (path: string, strokeWidth = 1.25): ProtectedDetail =>
  ({ x: 0, y: 0, path, stroke: ink, strokeWidth });

// The plates follow the dome in staggered rows. Each shield has a rounded
// skirt and a raised, off-centre keel rather than straight polygon edges.
function scute(id: string, x: number, y: number, w: number, h: number): PaintRegion {
  return { id, x, y, parent: "body", outline: 1.9,
    path: `M0 ${h * .65} C${w * .06} ${h * .35} ${w * .25} ${h * .24} ${w * .38} ${h * .13} C${w * .45} ${-h * .05} ${w * .53} ${-h * .04} ${w * .59} ${h * .13} Q${w * .69} ${h * .3} ${w * .82} ${h * .4} Q${w * .98} ${h * .53} ${w} ${h * .72} C${w * .77} ${h * 1.04} ${w * .27} ${h * 1.14} 0 ${h * .65} Z` };
}
function keel(x: number, y: number, w: number, h: number): ProtectedDetail {
  return line(`M${x + w * .43} ${y + h * .15} Q${x + w * .42} ${y + h * .46} ${x + w * .54} ${y + h * .77} M${x + w * .19} ${y + h * .66} Q${x + w * .3} ${y + h * .83} ${x + w * .42} ${y + h * .82}`, 1.05);
}

type Shield = readonly [number, number, number, number];
const broadShields: readonly Shield[] = [
  [155, 128, 44, 25], [194, 116, 48, 28], [238, 120, 46, 28], [280, 137, 37, 26],
  [139, 154, 46, 34], [179, 141, 53, 39], [228, 145, 54, 39], [277, 162, 48, 34],
  [147, 185, 51, 36], [193, 178, 57, 41], [245, 188, 53, 37], [290, 196, 40, 29]
];
const smallShields: readonly Shield[] = [
  [158, 132, 29, 21], [183, 122, 32, 23], [212, 116, 33, 24], [242, 120, 32, 23], [271, 130, 30, 23], [298, 145, 26, 24],
  [143, 155, 33, 27], [171, 144, 38, 31], [204, 140, 40, 32], [239, 146, 39, 31], [273, 157, 36, 30], [304, 175, 29, 28],
  [136, 179, 32, 28], [163, 171, 41, 32], [199, 168, 43, 35], [237, 176, 42, 34], [274, 188, 37, 31],
  [185, 203, 37, 28], [218, 205, 38, 28], [252, 212, 33, 24], [305, 202, 26, 22]
];

const landscape = [
  region("sun", "M91 40 C91 22 118 22 119 40 C120 58 92 59 91 40 Z", undefined, 1.8),
  region("distant-ridge", "M158 89 Q172 79 184 65 Q188 60 193 66 L215 88 Q229 84 240 71 Q245 67 250 72 Q268 91 294 99 Q311 90 326 77 Q332 73 338 79 Q354 94 373 98 L389 145 L153 145 Z", undefined, 1.6),
  region("hills", "M24 163 C32 126 74 99 112 110 Q143 116 162 124 C193 133 216 105 245 110 C293 115 309 103 350 111 Q407 110 436 146 Q446 186 439 249 L23 249 Q16 207 24 163 Z", undefined, 1.8),
  region("clearing", "M22 234 Q60 213 109 228 Q151 237 200 225 Q265 213 314 226 Q380 215 440 239 Q448 255 439 282 Q393 299 338 290 Q283 301 225 292 Q167 300 115 288 Q61 295 23 278 Q15 258 22 234 Z", undefined, 2)
];
const animal = [
  region("tail", "M163 185 C133 189 113 183 96 170 Q83 160 70 155 L63 166 C82 186 115 210 153 216 Q170 205 163 185 Z"),
  region("tail-club", "M77 151 C82 139 73 123 57 124 C41 123 31 134 34 145 Q35 152 43 155 C32 163 35 180 51 184 C68 189 82 178 77 165 Q82 159 77 151 Z"),
  region("rear-far", "M198 208 Q216 207 220 222 C224 236 217 246 220 253 Q232 260 228 265 C221 270 199 269 195 265 Q191 260 197 253 L195 240 Q188 224 198 208 Z"),
  region("front-far", "M304 202 Q321 201 327 217 Q332 231 326 244 L329 254 Q342 259 338 265 C330 270 311 268 307 264 Q304 261 309 254 L307 237 Q298 218 304 202 Z"),
  region("body", "M128 186 C132 153 160 125 207 116 C255 107 300 120 325 153 C338 170 345 199 328 214 C304 236 247 238 205 231 C168 229 138 221 130 205 Q126 196 128 186 Z", undefined, 2.7),
  region("rear-near", "M164 213 C166 201 185 200 193 214 Q201 228 191 242 C186 251 190 258 188 266 Q194 274 188 278 C180 283 152 281 148 276 Q144 270 153 265 L158 247 C150 234 155 219 164 213 Z", undefined, 2.5),
  region("front-near", "M279 215 C286 204 304 208 309 220 Q314 235 305 246 L305 263 Q318 272 312 278 C302 284 277 281 273 277 Q269 272 277 266 L276 248 C267 235 270 223 279 215 Z", undefined, 2.5),
  region("head", "M344 181 C353 174 366 175 375 184 Q384 193 398 196 C410 198 412 210 403 217 Q396 224 380 223 C364 231 343 224 337 213 Q330 195 344 181 Z", undefined, 2.5),
  region("brow-armor", "M342 184 Q352 175 364 180 Q374 182 379 190 Q367 188 359 194 Q346 196 342 184 Z", "head", 1.7),
  region("beak", "M395 195 C407 197 412 204 408 212 Q405 220 393 222 Q389 208 395 195 Z", "head", 1.8),
  region("cheek-horn", "M350 205 Q341 201 337 207 Q335 215 324 225 C340 226 353 220 356 213 Q358 207 350 205 Z", undefined, 2),
  region("horn-near", "M346 186 C339 181 335 173 336 167 Q350 170 358 181 Q357 186 346 186 Z", undefined, 2)
];
const faceAndFeet: readonly ProtectedDetail[] = [
  { x: 364, y: 194, width: 7.5, height: 9.5, rotation: -8, fill: ink },
  { x: 365, y: 195, width: 2.6, height: 3, rotation: 0, fill: "#ffffff" },
  { x: 399, y: 203, width: 3, height: 2.3, rotation: 12, fill: ink },
  line("M362 191 Q368 187 373 191 M375 213 Q385 217 393 211 M350 195 Q346 197 346 200 M359 214 Q362 218 368 218", 1.4),
  line("M165 235 Q173 239 181 235 M282 238 Q290 242 298 237 M200 247 Q206 249 212 246 M314 246 L321 247 M156 263 Q169 267 181 262 M282 263 Q292 266 301 262", 1.2),
  line("M156 278 C153 271 159 269 163 273 L164 280 M168 280 C166 272 172 269 176 274 L177 280 M181 279 Q179 273 184 272 M282 279 C279 271 285 269 289 273 L290 281 M294 280 C293 272 299 270 302 274 L303 280 M307 279 Q305 274 309 273 M200 266 Q198 259 203 259 M210 268 Q208 260 214 260 M315 265 Q312 259 317 258 M326 267 Q323 260 328 260", 1.3),
  line("M80 169 Q97 187 121 194 M85 169 L81 176 M96 178 L92 185 M108 184 L104 192 M48 132 Q60 128 68 138 M44 168 Q42 176 54 179 M43 155 Q60 151 73 158", 1.2)
];

// Lobed fronds stay single generous coloring regions at the youngest level.
function fern(id: string, x: number, y: number, rich: boolean): { regions: PaintRegion[]; details: ProtectedDetail[] } {
  const paths = [
    "M0 0 Q-10 0 -16 -9 Q-25 -6 -31 -12 L-23 -14 Q-35 -13 -39 -22 L-31 -23 Q-41 -24 -43 -33 Q-31 -34 -26 -26 L-25 -32 Q-16 -31 -14 -21 L-12 -26 Q-5 -20 -5 -12 L-2 -16 Q3 -9 0 0 Z",
    "M0 0 Q-13 -6 -14 -17 L-7 -13 Q-18 -23 -14 -32 L-7 -26 Q-15 -39 -5 -49 Q5 -45 2 -34 L7 -38 Q13 -28 4 -21 L10 -24 Q16 -13 5 -8 Z",
    "M0 0 Q0 -13 10 -21 L11 -15 Q14 -28 23 -31 L23 -24 Q31 -35 40 -31 Q42 -22 28 -19 L35 -18 Q31 -9 20 -10 L25 -6 Q14 3 0 0 Z"
  ];
  const regions = paths.map((path, i) => ({ ...region(`${id}-${i + 1}`, path, undefined, 1.8), x, y }));
  const details: ProtectedDetail[] = [ { ...line("M-1 2 Q-13 -10 -30 -24 M0 0 Q-2 -20 -2 -37 M0 0 Q15 -15 30 -23", 1.1), x, y } ];
  if (rich) details.push({ ...line("M-11 -10 L-20 -10 M-18 -16 L-26 -16 M-3 -13 L-8 -22 M-2 -23 L2 -29 M10 -10 L10 -18 M19 -16 L19 -21", .9), x, y });
  return { regions, details };
}

function scene(rich: boolean): Geometry {
  const shields = rich ? smallShields : broadShields;
  const leftFern = fern("fern-left", 73, 282, rich), rightFern = fern("fern-right", 410, 279, rich);
  const regions = [...landscape];
  if (rich) regions.push(
    region("ridge-face", "M188 65 Q194 73 194 81 L211 100 L178 104 Q187 87 188 65 Z", "distant-ridge", 1.2),
    region("river", "M373 131 Q356 150 380 167 Q400 183 377 207 Q358 225 377 240 Q398 264 366 293 L333 294 Q368 268 350 251 Q325 230 349 208 Q378 183 358 172 Q334 157 355 130 Z", "clearing", 1.5),
    region("river-bank", "M373 131 Q363 149 387 164 Q408 186 384 207 L371 214 Q398 181 374 170 Q350 150 363 132 Z", "hills", 1.4),
    region("cloud", "M36 65 C24 62 27 49 36 49 C36 35 55 32 61 43 Q77 37 82 51 C96 52 96 64 83 65 Z", undefined, 1.7),
    region("cloud-wisp", "M301 46 Q292 36 304 31 Q309 19 320 28 Q332 24 336 36 Q348 35 351 44 Q330 48 301 46 Z", undefined, 1.5)
  );
  // Side spikes sit behind the shell; the nearer shields overlap its surface.
  regions.push(...animal.slice(0, 4),
    region("hip-spike", "M150 165 Q131 164 117 153 Q123 179 141 187 Z"),
    region("shoulder-spike", "M315 161 Q329 150 332 136 Q343 161 330 180 Z"),
    animal[4]!, ...shields.map(([x, y, w, h], i) => scute(`scute-${i + 1}`, x, y, w, h)),
    ...animal.slice(5)
  );
  if (rich) regions.push(
    region("cheek-scale", "M356 205 Q362 202 366 207 Q366 213 361 214 Q355 212 356 205 Z", "head", 1.2),
    region("rear-leg-scale", "M165 217 Q172 210 180 214 Q186 219 181 225 Q171 229 164 224 Z", "rear-near", 1.3),
    region("front-leg-scale", "M282 219 Q288 213 297 218 Q304 224 298 229 Q288 232 282 227 Z", "front-near", 1.3),
    region("tail-plate", "M114 183 Q124 178 133 185 L141 196 Q126 199 116 193 Z", "tail", 1.4),
    region("club-lobe", "M43 155 Q57 150 73 158 Q77 169 70 177 Q53 187 42 173 Q37 163 43 155 Z", "tail-club", 1.4)
  );
  regions.push(
    region("rock-left", "M96 281 Q94 270 103 263 Q110 256 121 262 L133 274 Q136 280 130 284 Q112 287 96 281 Z", undefined, 1.8),
    region("rock-right", "M343 277 Q342 267 352 261 Q361 259 371 270 L374 278 Q359 284 343 277 Z", undefined, 1.8),
    ...leftFern.regions, ...rightFern.regions
  );
  if (rich) regions.push(
    region("rock-facet", "M103 264 Q112 260 121 263 L118 273 L132 279 L108 282 Z", "rock-left", 1.2),
    region("pebble-1", "M227 276 Q229 269 237 270 Q247 273 243 279 Q233 282 227 276 Z", undefined, 1.4),
    region("pebble-2", "M248 287 Q251 282 257 284 Q265 287 259 291 Q251 293 248 287 Z", undefined, 1.3),
    region("horsetail-stem", "M418 181 Q421 151 417 119 L422 118 Q427 155 423 181 Z", undefined, 1.5),
    region("horsetail-crown", "M419 122 Q412 109 419 96 Q429 109 423 122 Z", undefined, 1.5)
  );
  // Protected ink composites above every region, so keels hidden by the legs
  // are omitted instead of drawing through the knees.
  const details = [...faceAndFeet, ...shields.filter((_, index) => !(rich ? [17, 19, 20] : [8, 11]).includes(index)).map(([x, y, w, h]) => keel(x, y, w, h)), ...leftFern.details, ...rightFern.details,
    line("M91 285 Q98 290 107 289 M136 288 Q143 286 148 288 M320 285 Q328 282 336 284 M386 286 L382 280 M387 285 L391 279 M30 248 Q37 244 43 246", 1.1)
  ];
  if (rich) details.push(
    line("M416 132 L424 132 M417 145 L425 145 M417 158 L424 158 M416 170 L424 170 M419 138 Q403 133 401 124 M423 138 Q435 133 438 125 M420 151 Q405 148 400 140 M423 151 Q435 148 441 140 M419 165 Q405 162 401 154 M423 165 Q438 162 441 153", 1.2),
    line("M151 188 Q151 191 154 192 M155 195 L157 197 M316 185 L319 188 M310 180 L312 182 M141 199 L144 202 M240 234 L243 235 M251 235 L254 235 M263 235 L266 234 M350 275 L355 267 L363 268 M46 70 Q59 73 71 70 M299 51 Q310 54 319 52", 1)
  );
  // Small accents remain visible as protected linework rather than tiny fill targets.
  const decorative = new Set(rich
    ? ["hip-spike", "shoulder-spike", "scute-1", "scute-6", "scute-20", "scute-21", "brow-armor", "horn-near", "cheek-scale", "rear-leg-scale", "front-leg-scale", "tail-plate", "rock-left", "rock-facet", "pebble-1", "pebble-2", "horsetail-stem", "horsetail-crown"]
    : ["hip-spike", "shoulder-spike", "brow-armor", "horn-near"]);
  const paintable = regions.filter(({ id }) => !decorative.has(id));
  details.push(...regions.filter(({ id }) => decorative.has(id)).map(({ id: _id, parent: _parent, outline, ...shape }) => ({ ...shape, stroke: ink, strokeWidth: outline })));
  return {
    artwork: Object.freeze({ version: rich ? "ankylosaurus-explorer-1" : "ankylosaurus-hatchling-2", regions: Object.freeze(paintable.map(({ id }) => id)) }),
    regions: paintable, details
  };
}

export const ANKYLOSAURUS_HATCHLING = scene(false);
export const ANKYLOSAURUS_EXPLORER = scene(true);
