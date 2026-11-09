import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const ink = "#091e40";
const region = (id: string, path: string, parent?: string, outline = 2.4): PaintRegion =>
  ({ id, x: 0, y: 0, path, outline, ...(parent ? { parent } : {}) });
const line = (path: string, strokeWidth = 1.4): ProtectedDetail =>
  ({ x: 0, y: 0, path, stroke: ink, strokeWidth });

const dinosaur = [
  region("tail", "M213 161 C170 167 133 155 105 139 C80 125 61 107 41 105 C51 127 77 155 104 174 C136 197 168 211 207 214 Q223 190 213 161 Z"),
  region("leg-far", "M251 197 C276 190 305 211 297 232 Q294 245 281 252 L288 259 Q307 258 317 267 C326 277 317 284 303 284 L268 284 Q253 282 254 270 L239 243 Q231 213 251 197 Z"),
  region("body", "M194 170 C206 147 232 145 252 128 Q265 115 275 103 C286 96 303 111 305 130 C308 153 319 171 305 193 C290 218 263 233 232 230 C204 230 182 211 187 191 Q189 179 194 170 Z", undefined, 2.8),
  region("arm-far", "M301 140 Q315 135 324 148 L328 157 Q334 155 340 159 Q346 162 344 167 Q342 170 335 168 Q342 174 338 178 Q332 182 322 174 Q311 173 307 164 L298 153 Q294 145 301 140 Z", undefined, 2),
  region("leg-near", "M212 198 C235 185 260 200 259 221 C259 235 245 245 235 253 L237 267 C251 266 268 270 274 278 Q280 289 267 292 L208 292 C196 292 194 283 201 275 L207 266 L203 245 C181 229 191 209 212 198 Z", undefined, 2.7),
  region("head", "M267 112 C258 98 261 76 272 62 C282 49 304 48 320 56 Q332 63 352 61 C378 57 406 61 413 76 C420 89 419 113 410 125 C401 140 374 143 350 137 Q330 133 315 141 C294 152 273 140 267 124 Q264 118 267 112 Z", undefined, 2.8),
  region("arm-near", "M280 166 C287 158 297 164 301 174 L306 183 Q313 180 321 184 Q327 187 325 192 Q323 195 316 193 Q323 199 318 202 Q314 205 304 199 Q292 198 288 188 L280 181 Q274 174 280 166 Z", undefined, 2.2)
];

const faceAndFeet: readonly ProtectedDetail[] = [
  { x: 285, y: 76, width: 18, height: 23, rotation: -8, fill: ink },
  { x: 288, y: 78, width: 6, height: 7, rotation: 0, fill: "#ffffff" },
  { x: 296, y: 89, width: 3, height: 4, rotation: 0, fill: "#ffffff" },
  { x: 395, y: 83, width: 5, height: 3.5, rotation: -12, fill: ink },
  line("M281 70 Q291 63 301 69 M313 115 C337 127 381 128 402 110 M310 111 Q308 116 313 120 M394 108 Q400 106 404 111", 1.8),
  // Teeth and digit divisions are ink, not small regions competing with a finger tap.
  line("M337 123 Q340 133 345 125 M361 126 Q365 136 369 125 M317 164 L324 167 M302 188 L309 192", 1.3),
  line("M224 212 Q233 208 240 215 M218 249 Q223 253 230 252 M211 265 Q220 269 229 265 M251 242 L259 247 M265 258 Q270 262 277 261", 1.4),
  line("M218 290 Q215 279 222 277 Q229 278 229 291 M238 291 Q234 279 242 278 Q249 280 249 291 M258 290 Q254 282 261 280 M274 279 Q270 270 277 268 M287 279 Q283 270 289 268 M299 278 Q296 272 302 271", 1.5)
];

function plant(rich: boolean): { regions: PaintRegion[]; details: ProtectedDetail[] } {
  const regions = [
    region("plant-left", "M76 282 C44 284 23 268 23 238 C51 232 78 249 76 282 Z", undefined, 2),
    region("plant-crown", "M77 281 C49 263 50 225 72 210 C98 220 102 259 77 281 Z", undefined, 2),
    region("plant-right", "M79 282 C77 251 106 232 129 240 C137 263 109 286 79 282 Z", undefined, 2)
  ];
  const details = [line("M42 252 Q60 261 76 282 Q75 255 73 233 M79 282 Q94 267 108 259", 1.1)];
  if (rich) details.push(line("M55 260 L53 251 M65 269 L65 259 M72 249 L67 244 M75 260 L82 251 M91 271 L101 271", 1));
  return { regions, details };
}

function scene(rich: boolean): Geometry {
  const foliage = plant(rich);
  const regions: PaintRegion[] = [];
  if (rich) regions.push(
    region("sun", "M146 42 C146 21 178 21 178 42 C178 64 146 64 146 42 Z", undefined, 2),
    region("cloud", "M36 68 C23 67 23 51 35 49 C34 33 57 29 65 43 C77 37 91 44 91 55 Q106 57 103 67 Q69 74 36 68 Z", undefined, 2),
    region("ridge", "M98 118 Q121 101 140 78 Q148 69 158 80 L190 108 Q207 104 223 90 Q230 84 237 91 L270 122 L263 176 L93 173 Z", undefined, 2),
    region("hills", "M23 191 C49 164 74 161 103 169 C146 182 175 151 213 162 C265 181 312 153 356 157 Q407 146 438 178 L438 274 L22 274 Z", undefined, 2)
  );
  regions.push(region("ground", "M24 266 Q59 251 105 263 C162 271 197 252 242 260 Q283 268 324 260 Q385 248 437 268 Q448 282 435 297 Q385 306 329 299 Q275 306 219 300 Q161 306 110 298 Q60 304 25 290 Q18 280 24 266 Z", undefined, 2));
  if (rich) regions.push(
    region("cycad-trunk", "M72 222 Q80 165 73 105 L87 104 Q95 162 91 222 Z", undefined, 2),
    region("cycad-left", "M80 108 C51 125 21 113 16 88 C42 72 72 85 80 108 Z", undefined, 2),
    region("cycad-crown", "M80 104 C53 88 53 53 72 39 C97 51 103 84 80 104 Z", undefined, 2),
    region("cycad-right", "M83 108 C85 90 108 65 132 76 C139 102 107 123 83 108 Z", undefined, 2)
  );
  const markings = rich ? [
    region("belly", "M288 146 Q301 153 298 165 Q285 178 281 198 Q269 216 252 220 Q244 209 249 197 Q263 183 267 167 Q274 150 288 146 Z", "body", 1.8),
    region("back-mark", "M210 160 Q230 151 249 141 Q251 151 241 166 Q232 182 215 185 Q203 178 210 160 Z", "body", 1.8),
    region("tail-mark", "M115 150 Q132 159 150 162 C151 174 157 183 162 192 Q141 186 128 178 Q123 164 115 150 Z", "tail", 1.8),
    region("thigh-mark", "M220 204 Q231 196 241 205 Q250 215 239 224 Q228 232 219 223 Q212 213 220 204 Z", "leg-near", 1.8)
  ] : [];
  // Markings sit on their own skin surface, behind the foreground limbs and head.
  for (const part of dinosaur) regions.push(part, ...markings.filter(({ parent }) => parent === part.id));
  if (rich) regions.push(
    region("rock", "M132 284 Q134 269 149 261 Q159 255 171 266 L183 286 Q159 294 132 284 Z", undefined, 2.1),
    region("rock-face", "M149 264 Q158 263 169 268 L180 284 L158 287 Z", "rock", 1.7)
  );
  regions.push(...foliage.regions);
  const details = [...faceAndFeet, ...foliage.details,
    line("M104 288 Q116 284 124 288 M310 291 Q322 287 332 290 M399 287 L402 279 M402 287 L409 282", 1.2)
  ];
  if (rich) details.push(
    line("M25 97 Q53 97 77 108 M72 60 Q82 81 80 103 M87 106 Q102 91 113 88 M78 177 L90 177 M77 191 L90 191 M76 205 L89 205", 1.1),
    line("M141 89 Q149 93 157 88 M192 187 L197 190 M248 154 L251 152 M272 71 L274 68 M381 73 L386 74", 1.1)
  );
  return {
    artwork: Object.freeze({ version: rich ? "trex-explorer-1" : "trex-hatchling-1", regions: Object.freeze(regions.map(({ id }) => id)) }),
    regions, details
  };
}

export const TREX_HATCHLING = scene(false);
export const TREX_EXPLORER = scene(true);
