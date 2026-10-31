import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

// The low dome and short feet leave room for a broad, two-lobed tail club.
// Armor panels are clipped to the body and own their paint independently.
const regions: readonly PaintRegion[] = [
  { id: "tail", x: 0, y: 0, outline: 3, path: "M143 174 Q105 184 76 147 L61 151 Q78 199 132 205 L155 191 Z" },
  { id: "tail-club", x: 0, y: 0, outline: 3, path: "M77 146 C94 134 87 107 70 108 Q58 106 53 116 C39 105 22 118 27 134 C19 151 36 167 51 159 Q68 171 77 146 Z" },
  { id: "rear-far", x: 0, y: 0, outline: 3, path: "M177 212 L204 215 L204 248 L213 259 Q204 268 179 262 L175 239 Z" },
  { id: "front-far", x: 0, y: 0, outline: 3, path: "M292 208 L319 208 L320 246 L329 257 Q321 266 298 261 L290 239 Z" },
  { id: "body", x: 0, y: 0, outline: 3, path: "M115 186 C115 140 153 108 212 106 C266 102 310 123 333 163 Q351 195 330 216 C300 240 244 245 190 234 Q133 231 115 205 Z" },
  { id: "armor-1", x: 0, y: 0, parent: "body", outline: 2.5, path: "M137 150 L153 136 Q160 130 168 138 L180 153 L168 165 L145 165 Z" },
  { id: "armor-2", x: 0, y: 0, parent: "body", outline: 2.5, path: "M184 139 L198 125 Q205 117 213 125 L229 140 L217 157 L195 157 Z" },
  { id: "armor-3", x: 0, y: 0, parent: "body", outline: 2.5, path: "M235 140 L248 118 Q256 112 264 120 L280 144 L266 160 L245 158 Z" },
  { id: "armor-4", x: 0, y: 0, parent: "body", outline: 2.5, path: "M283 150 L295 135 Q302 130 310 140 L325 163 L313 175 L292 170 Z" },
  { id: "armor-5", x: 0, y: 0, parent: "body", outline: 2.5, path: "M148 184 L165 174 Q174 171 183 179 L194 197 L180 211 L159 208 Z" },
  { id: "armor-6", x: 0, y: 0, parent: "body", outline: 2.5, path: "M203 181 L222 168 Q229 165 237 173 L251 194 L239 211 L215 211 Z" },
  { id: "armor-7", x: 0, y: 0, parent: "body", outline: 2.5, path: "M261 185 L280 174 Q288 173 294 183 L304 200 L290 214 L269 210 Z" },
  { id: "rear-near", x: 0, y: 0, outline: 3, path: "M139 216 Q151 207 169 219 L171 248 L175 267 Q163 278 138 270 Q132 264 139 255 L135 234 Z" },
  { id: "front-near", x: 0, y: 0, outline: 3, path: "M266 222 Q279 210 296 222 L295 250 L302 269 Q290 278 265 272 Q258 267 265 258 L261 240 Z" },
  { id: "head", x: 0, y: 0, outline: 3, path: "M327 161 Q342 145 362 157 Q380 161 389 178 L415 183 Q437 187 434 205 Q432 221 410 226 L376 229 Q350 232 332 218 Q319 200 327 181 Z" },
  { id: "head-armor", x: 0, y: 0, parent: "head", outline: 2.5, path: "M327 171 L343 153 L362 155 L377 168 L366 180 L344 181 Z" },
  { id: "muzzle", x: 0, y: 0, parent: "head", outline: 2.5, path: "M400 182 Q390 204 400 228 L433 232 L445 184 Z" }
];
const details: readonly ProtectedDetail[] = [
  { x: 368, y: 185, width: 10, height: 13, rotation: 0, fill: "#091e40" },
  { x: 371, y: 186, width: 3, height: 4, rotation: 0, fill: "#ffffff" },
  { x: 418, y: 197, width: 4, height: 3, rotation: 0, fill: "#091e40" },
  { x: 0, y: 0, path: "M363 180 Q371 176 379 181 M391 213 Q405 220 419 212 M144 271 L145 264 M157 273 L157 265 M273 273 L274 265 M287 274 L286 266 M186 264 L186 257 M199 264 L198 257 M306 263 L306 256 M318 262 L316 255", stroke: "#091e40", strokeWidth: 2 }
];

export const ANKYLOSAURUS: Geometry = {
  artwork: Object.freeze({ version: "ankylosaurus-production-1", regions: Object.freeze(regions.map(region => region.id)) }),
  regions, details
};
