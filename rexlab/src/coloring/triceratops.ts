import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

const regions: readonly PaintRegion[] = [
  { id: "tail", x: 0, y: 0, outline: 3, path: "M133 157 Q87 164 35 139 Q48 178 119 190 Q143 183 133 157 Z" },
  { id: "rear-far", x: 0, y: 0, outline: 3, path: "M160 204 Q177 218 176 244 L178 271 Q170 278 150 273 L147 240 L140 215 Z" },
  { id: "front-far", x: 0, y: 0, outline: 3, path: "M273 200 L300 205 L298 244 L306 268 Q300 277 276 272 L267 237 Z" },
  { id: "body", x: 0, y: 0, outline: 3, path: "M108 177 C108 130 166 112 213 123 C255 122 294 141 315 173 L304 215 Q274 241 209 235 C149 238 107 218 108 177 Z" },
  { id: "belly", x: 176, y: 177, width: 94, height: 48, rotation: 0, parent: "body", outline: 2 },
  { id: "spot-1", x: 139, y: 141, width: 30, height: 22, rotation: 15, parent: "body", outline: 2 },
  { id: "spot-2", x: 184, y: 135, width: 34, height: 24, rotation: 0, parent: "body", outline: 2 },
  { id: "rear-near", x: 0, y: 0, outline: 3, path: "M131 204 Q145 196 163 211 Q169 229 157 248 L157 279 Q146 286 121 280 Q118 273 126 266 L130 240 Q121 222 131 204 Z" },
  { id: "front-near", x: 0, y: 0, outline: 3, path: "M260 210 Q274 200 290 215 L284 249 L291 277 Q282 286 256 280 Q250 273 258 267 L254 240 Z" },
  { id: "frill", x: 0, y: 0, outline: 3, path: "M321 225 C299 226 279 215 282 199 C264 194 263 177 275 167 C258 153 267 134 281 131 C273 112 285 98 300 99 C298 79 315 70 330 80 C341 61 362 66 369 83 C389 78 403 93 396 110 C416 116 418 137 403 147 C415 166 403 181 389 184 Q370 227 321 225 Z" },
  { id: "head", x: 0, y: 0, outline: 3, path: "M332 147 C352 134 379 142 390 166 Q398 180 421 185 Q439 190 434 206 Q429 222 405 224 L380 224 C369 241 340 239 330 222 Q315 202 324 180 Z" },
  { id: "horn-far", x: 0, y: 0, outline: 3, path: "M342 151 Q349 118 390 87 Q378 127 362 159 Q351 164 342 151 Z" },
  { id: "horn-near", x: 0, y: 0, outline: 3, path: "M366 161 Q379 132 423 113 Q405 145 386 174 Q373 177 366 161 Z" },
  { id: "horn-nose", x: 0, y: 0, outline: 3, path: "M411 187 Q419 169 438 157 Q439 179 429 196 Q418 198 411 187 Z" }
];
const details: readonly ProtectedDetail[] = [
  { x: 368, y: 179, width: 10, height: 13, rotation: 0, fill: "#091e40" },
  { x: 371, y: 180, width: 3, height: 4, rotation: 0, fill: "#ffffff" },
  { x: 421, y: 200, width: 4, height: 3, rotation: 0, fill: "#091e40" },
  { x: 0, y: 0, path: "M398 212 Q410 217 421 211", stroke: "#091e40", strokeWidth: 2 },
  { x: 0, y: 0, path: "M131 280 L132 272 M143 281 L144 273 M266 281 L266 273 M278 281 L277 273", stroke: "#091e40", strokeWidth: 2 }
];

export const TRICERATOPS: Geometry = {
  artwork: Object.freeze({ version: "triceratops-production-1", regions: Object.freeze(regions.map(region => region.id)) }),
  regions, details
};
