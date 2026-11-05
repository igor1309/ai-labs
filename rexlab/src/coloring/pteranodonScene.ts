import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const ink = "#091e40";
const region = (id: string, path: string, parent?: string, outline = 2.4): PaintRegion =>
  ({ id, x: 0, y: 0, path, outline, ...(parent ? { parent } : {}) });
const line = (path: string, strokeWidth = 1.4): ProtectedDetail =>
  ({ x: 0, y: 0, path, stroke: ink, strokeWidth });

// A friendly Pteranodon soaring at the viewer: huge wings, a long beak and a swept-back crest.
const WING_LEFT = "M214 108 C180 96 148 78 124 70 C88 84 48 108 18 140 C52 134 84 146 104 180 C134 168 170 176 212 196 Z";
const WING_RIGHT = "M246 108 C280 96 312 78 336 70 C372 84 412 108 442 140 C408 134 376 146 356 180 C326 168 290 176 248 196 Z";
const legs = [
  region("leg-left", "M214 190 C208 206 200 222 188 236 L206 242 C214 232 222 222 226 210 Z", undefined, 2.3),
  region("leg-right", "M246 190 C252 206 260 222 272 236 L254 242 C246 232 238 222 234 210 Z", undefined, 2.3)
];
const body = region("body", "M230 62 C242 62 244 86 246 104 C258 122 262 150 256 176 C250 200 240 220 230 236 C220 220 210 200 204 176 C198 150 202 122 214 104 C216 86 218 62 230 62 Z", undefined, 2.8);
const crest = region("crest", "M216 28 C188 20 156 14 118 14 C144 30 176 48 208 56 Z", undefined, 2.6);
const beak = region("beak", "M266 34 C300 34 340 40 376 54 C342 62 304 68 266 68 Q272 50 266 34 Z", undefined, 2.6);
const head = region("head", "M204 52 C204 30 226 20 248 24 C258 26 266 32 272 38 L272 66 C258 72 240 76 226 74 C212 72 204 64 204 52 Z", undefined, 2.8);

const face: readonly ProtectedDetail[] = [
  { x: 232, y: 32, width: 13, height: 15, rotation: -6, fill: ink },
  { x: 235, y: 34, width: 4.5, height: 5, rotation: 0, fill: "#ffffff" },
  { x: 240, y: 41, width: 2.2, height: 2.6, rotation: 0, fill: "#ffffff" },
  // The smile and toes are ink, not small regions competing with a finger tap.
  line("M368 54 C338 51 302 51 272 54 Q258 56 250 50", 1.8),
  line("M190 236 L184 246 M197 239 L193 248 M204 241 L202 249 M270 236 L276 246 M263 239 L267 248 M256 241 L258 249", 1.5)
];

function scene(rich: boolean): Geometry {
  const regions: PaintRegion[] = [];
  if (rich) regions.push(
    region("sky", "M22 8 L438 8 Q450 8 450 20 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 L10 20 Q10 8 22 8 Z", undefined, 2),
    region("sun", "M390 42 C390 14 434 14 434 42 C434 70 390 70 390 42 Z", undefined, 2),
    region("cloud-high", "M34 62 C20 60 20 44 34 42 C34 26 60 22 68 36 C80 28 96 36 96 48 Q110 50 106 62 Q70 68 34 62 Z", undefined, 2),
    region("cloud-low", "M106 236 C92 234 92 218 106 216 C106 200 132 196 140 210 C152 202 166 210 166 222 Q178 224 174 236 Q140 242 106 236 Z", undefined, 2),
    region("sea", "M10 262 Q50 248 90 262 Q130 276 170 262 Q210 248 250 262 Q290 276 330 262 Q390 248 450 262 L450 290 Q450 302 438 302 L22 302 Q10 302 10 290 Z", undefined, 2),
    region("cliff-right", "M322 302 C324 272 332 252 350 240 C358 214 384 198 414 200 C434 202 450 212 450 228 L450 290 Q450 302 438 302 Z", undefined, 2.2),
    region("cliff-right-top", "M340 246 C366 234 380 222 398 226 C416 232 430 222 456 228 L456 190 L340 190 Z", "cliff-right", 1.8),
    region("cliff-left", "M10 248 C20 226 50 218 72 224 C92 230 102 262 110 302 L22 302 Q10 302 10 290 Z", undefined, 2.2),
    region("cliff-left-top", "M4 250 C20 244 30 244 42 248 C58 254 74 244 100 254 L100 210 L4 210 Z", "cliff-left", 1.8)
  ); else regions.push(
    region("sea", "M22 268 Q62 254 102 268 Q142 282 182 268 Q222 254 262 268 Q302 282 342 268 Q382 254 438 268 Q448 282 436 296 Q230 306 24 296 Q12 282 22 268 Z", undefined, 2),
    region("cloud", "M42 232 C22 230 22 206 42 202 C42 180 76 176 86 194 C100 186 120 196 120 212 Q136 214 132 230 Q86 240 42 232 Z", undefined, 2)
  );
  regions.push(...legs, region("wing-left", WING_LEFT, undefined, 2.8));
  if (rich) regions.push(region("wing-left-arm", "M214 108 C180 96 148 78 124 70 C88 84 48 108 18 140 C60 120 100 106 132 106 C162 110 190 124 212 146 Z", "wing-left", 1.8));
  regions.push(region("wing-right", WING_RIGHT, undefined, 2.8));
  if (rich) regions.push(region("wing-right-arm", "M246 108 C280 96 312 78 336 70 C372 84 412 108 442 140 C400 120 360 106 328 106 C298 110 270 124 248 146 Z", "wing-right", 1.8));
  regions.push(body);
  if (rich) regions.push(region("belly", "M230 126 C244 126 250 150 246 176 C242 198 236 214 230 226 C224 214 218 198 214 176 C210 150 216 126 230 126 Z", "body", 1.8));
  regions.push(crest);
  if (rich) regions.push(region("crest-tip", "M170 19 C152 15 136 14 118 14 C134 24 150 34 168 42 Z", "crest", 1.8));
  regions.push(beak);
  if (rich) regions.push(region("jaw", "M264 54 C300 51 338 51 376 54 C342 62 304 68 266 68 Z", "beak", 1.8));
  regions.push(head);
  const details = [...face];
  if (rich) details.push(
    // Wing fingers, skin spots, waves and rock cracks stay protected linework, never tiny fill targets.
    line("M200 136 C160 124 112 126 72 142 M198 160 C160 150 130 152 106 170", 1.2),
    line("M260 136 C300 124 348 126 388 142 M262 160 C300 150 330 152 354 170", 1.2),
    { x: 150, y: 140, width: 7, height: 6, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    { x: 306, y: 140, width: 7, height: 6, rotation: 0, stroke: ink, strokeWidth: 1.2 },
    line("M440 42 L446 42 M384 42 L380 42 M392 22 L387 17 M432 22 L437 17 M392 62 L387 67 M432 62 L437 67 M412 70 L412 75 M412 16 L412 11", 1.2),
    line("M120 282 Q132 276 144 282 M190 288 Q202 282 214 288 M262 280 Q274 274 286 280", 1.2),
    line("M360 262 L372 272 L366 284 M410 244 L420 256 L414 268 M40 262 L50 272 L44 284 M76 262 L84 276", 1.2),
    // A far-off friend in the sky is a single protected stroke.
    line("M122 44 Q130 36 136 44 Q142 36 150 44", 1.4)
  );
  return {
    artwork: Object.freeze({ version: rich ? "pteranodon-explorer-1" : "pteranodon-hatchling-1", regions: Object.freeze(regions.map(({ id }) => id)) }),
    regions, details
  };
}

export const PTERANODON_HATCHLING = scene(false);
export const PTERANODON_EXPLORER = scene(true);
