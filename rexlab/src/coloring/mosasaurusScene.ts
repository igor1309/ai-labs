import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const ink = "#091e40";
const region = (id: string, path: string, parent?: string, outline = 2.4): PaintRegion =>
  ({ id, x: 0, y: 0, path, outline, ...(parent ? { parent } : {}) });
const line = (path: string, strokeWidth = 1.4): ProtectedDetail =>
  ({ x: 0, y: 0, path, stroke: ink, strokeWidth });

// A friendly swimming Mosasaurus: long jaws, four paddles and a crescent tail fin.
const reptile = [
  region("tail-fin", "M88 150 C70 128 52 108 30 98 Q30 128 50 152 Q34 178 26 210 C52 196 76 178 92 164 Z", undefined, 2.6),
  region("tail", "M196 128 C150 132 112 142 76 146 Q60 152 66 164 C110 172 154 178 198 174 Z", undefined, 2.6),
  region("flipper-far-back", "M180 160 C190 182 184 206 166 224 Q152 232 148 220 C152 204 154 186 150 166 Z", undefined, 2.2),
  region("flipper-far-front", "M318 146 C340 156 360 176 362 198 Q360 210 350 204 C336 190 318 174 304 160 Z", undefined, 2.2),
  region("body", "M168 136 C210 112 270 100 326 104 C352 108 360 132 348 152 C330 178 280 192 228 188 C196 186 172 176 160 162 Q156 146 168 136 Z", undefined, 2.8),
  region("flipper-near-back", "M192 182 Q206 172 218 182 C220 200 212 224 194 240 Q180 248 178 236 C186 218 194 200 192 182 Z", undefined, 2.4),
  region("flipper-near-front", "M270 168 Q286 160 298 170 C304 192 298 214 280 232 Q266 242 262 230 C270 212 274 192 270 168 Z", undefined, 2.4),
  region("head", "M316 112 C338 90 382 88 420 104 Q446 114 446 128 Q440 138 420 140 C392 150 356 154 330 150 Q306 142 316 112 Z", undefined, 2.8)
];

const face: readonly ProtectedDetail[] = [
  { x: 364, y: 100, width: 15, height: 17, rotation: -6, fill: ink },
  { x: 367, y: 102, width: 5, height: 5.5, rotation: 0, fill: "#ffffff" },
  { x: 373, y: 110, width: 2.5, height: 3, rotation: 0, fill: "#ffffff" },
  { x: 432, y: 112, width: 4.5, height: 3, rotation: -10, fill: ink },
  line("M360 96 Q370 90 380 95", 1.8),
  // The smile and teeth are ink, not small regions competing with a finger tap.
  line("M444 128 C420 134 386 136 352 130 Q344 128 342 122", 1.8),
  line("M428 131 L431 137 L434 131 M412 133 L415 139 L418 133 M396 134 L399 140 L402 134 M380 134 L383 140 L386 133", 1.3),
  // Paddle bones and tail-fin ribs are drawn, never extra targets.
  line("M286 186 L281 214 M278 182 L270 206 M168 186 L160 210 M346 180 L352 196 M208 186 L214 204 M60 130 L76 148 M52 186 L76 164", 1.3)
];

function seabed(rich: boolean): { regions: PaintRegion[]; details: ProtectedDetail[] } {
  const regions = [
    region("sand", "M22 268 Q70 252 124 262 C180 272 214 254 262 260 Q314 268 360 258 Q406 250 438 266 Q448 282 436 296 Q384 306 324 298 Q268 306 212 300 Q152 306 104 298 Q56 304 24 292 Q16 280 22 268 Z", undefined, 2),
    region("weed-left", "M70 280 C48 250 64 222 50 194 C76 210 82 246 90 280 Z", undefined, 2),
    region("weed-middle", "M94 282 C92 246 112 218 104 182 C128 206 124 250 112 282 Z", undefined, 2),
    region("weed-right", "M388 282 C384 250 404 230 398 202 C428 220 426 256 412 282 Z", undefined, 2)
  ];
  const details = [line("M62 240 Q70 258 80 278 M106 214 Q108 248 103 280 M406 232 Q404 258 401 280", 1.1)];
  if (rich) details.push(line("M60 220 L68 216 M64 252 L74 250 M104 232 L114 228 M108 258 L117 256 M402 246 L410 244", 1));
  return { regions, details };
}

function scene(rich: boolean): Geometry {
  const bed = seabed(rich);
  const regions: PaintRegion[] = [];
  if (rich) regions.push(
    region("sky", "M20 22 L440 22 L440 56 L20 56 Z", undefined, 2),
    region("water", "M20 44 Q60 32 100 44 T180 44 T260 44 T340 44 T440 44 L440 280 L20 280 Z", undefined, 2),
    region("fish-top", "M376 64 C388 48 412 48 422 64 L436 52 L434 78 L422 68 C412 82 388 82 376 64 Z", undefined, 2),
    region("fish-low", "M318 234 C330 218 354 218 364 234 L378 222 L376 248 L364 238 C354 252 330 252 318 234 Z", undefined, 2)
  );
  regions.push(bed.regions[0]!);
  if (rich) regions.push(
    region("rock", "M290 288 Q290 266 312 256 Q330 248 346 262 L362 288 Q326 298 290 288 Z", undefined, 2.1),
    region("rock-face", "M314 260 Q330 256 344 266 L358 286 L326 290 Z", "rock", 1.7),
    region("ammonite", "M140 278 C140 252 182 250 186 274 Q184 290 164 292 L144 290 Q138 284 140 278 Z", undefined, 2.2)
  );
  const markings = rich ? [
    region("belly", "M188 172 C230 178 290 172 352 140 Q354 160 336 168 C300 188 240 196 190 186 Z", "body", 1.8),
    region("back-mark", "M186 128 C220 114 270 104 322 106 Q322 118 312 120 C270 120 230 128 198 142 Z", "body", 1.8),
    region("tail-mark", "M124 136 L146 132 L148 180 L126 176 Z", "tail", 1.8),
    region("head-mark", "M324 110 C348 90 386 88 414 100 Q400 122 372 110 Q350 114 334 132 Z", "head", 1.8)
  ] : [];
  // Markings sit on their own skin surface, behind the paddles and head drawn after them.
  for (const part of reptile) regions.push(part, ...markings.filter(({ parent }) => parent === part.id));
  regions.push(...bed.regions.slice(1));
  const details = [...face, ...bed.details,
    line("M30 60 Q40 54 50 60 M210 44 Q222 38 234 44 M404 150 Q414 144 424 150", 1.2)
  ];
  if (rich) details.push(
    // Bubbles, fish eyes, fins and the ammonite spiral stay protected linework.
    { x: 408, y: 61, width: 4, height: 4, rotation: 0, fill: ink },
    { x: 350, y: 231, width: 4, height: 4, rotation: 0, fill: ink },
    line("M398 58 Q402 64 398 70 M340 228 Q344 234 340 240 M152 276 C150 266 172 264 172 276 C172 284 160 286 158 278 C158 274 164 274 164 278", 1.2),
    ...[[232, 74, 8], [242, 58, 6], [300, 80, 7], [306, 66, 5]].map(([x, y, size]) =>
      ({ x, y, width: size, height: size, rotation: 0, stroke: ink, strokeWidth: 1.2 }) as ProtectedDetail),
    line("M300 270 L306 266 M336 274 L342 270 M60 286 L66 282 M228 284 L236 284", 1.1)
  );
  return {
    artwork: Object.freeze({ version: rich ? "mosasaurus-explorer-1" : "mosasaurus-hatchling-1", regions: Object.freeze(regions.map(({ id }) => id)) }),
    regions, details
  };
}

export const MOSASAURUS_HATCHLING = scene(false);
export const MOSASAURUS_EXPLORER = scene(true);
