import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

// Back-to-front layers leave broad coloring spaces around the animal as well
// as on it. Frill panels and flank markings belong to their enclosing shape.
const regions: readonly PaintRegion[] = [
  { id: "sun", x: 47, y: 18, width: 42, height: 42, rotation: 0, outline: 2.5 },
  { id: "cloud", x: 0, y: 0, outline: 2.5, path: "M129 61 C113 61 111 44 124 39 C121 23 144 19 151 33 C163 23 180 31 179 43 C198 43 201 61 184 63 Z" },
  { id: "ridge", x: 0, y: 0, outline: 2.5, path: "M189 107 L231 42 Q235 36 239 42 L265 73 L282 62 L322 112 Z" },
  { id: "ridge-cap", x: 0, y: 0, parent: "ridge", outline: 2, path: "M211 70 L231 42 Q235 36 239 42 L260 67 L248 65 L239 74 L230 64 L222 72 Z" },
  { id: "meadow", x: 0, y: 0, outline: 2.5, path: "M14 244 Q77 211 133 231 Q204 208 277 228 Q364 209 446 235 L446 295 L14 295 Z" },
  { id: "stream", x: 0, y: 0, parent: "meadow", outline: 2, path: "M353 224 Q322 245 368 254 Q413 266 388 295 L282 295 Q343 275 312 265 Q269 247 322 221 Z" },
  { id: "tail", x: 0, y: 0, outline: 3, path: "M140 160 Q88 171 40 132 Q51 178 121 203 L151 183 Z" },
  { id: "rear-far", x: 0, y: 0, outline: 3, path: "M172 193 L198 203 L188 238 L193 259 Q185 266 164 260 L163 236 Z" },
  { id: "front-far", x: 0, y: 0, outline: 3, path: "M277 196 L302 195 L304 230 L317 251 Q310 263 288 258 L276 231 Z" },
  { id: "body", x: 0, y: 0, outline: 3, path: "M110 172 C110 137 139 111 187 111 C229 109 272 126 294 154 Q312 183 288 209 Q244 233 178 222 C133 221 109 205 110 172 Z" },
  { id: "flank", x: 0, y: 0, parent: "body", outline: 2, path: "M150 176 Q181 149 213 157 Q247 158 267 183 Q258 209 214 212 Q173 214 150 197 Z" },
  { id: "back-band-1", x: 0, y: 0, parent: "body", outline: 2, path: "M133 116 L160 109 Q148 129 155 150 Q139 159 127 148 Q124 132 133 116 Z" },
  { id: "back-band-2", x: 0, y: 0, parent: "body", outline: 2, path: "M177 105 L204 109 Q192 129 199 144 Q187 154 175 143 Q170 124 177 105 Z" },
  { id: "back-band-3", x: 0, y: 0, parent: "body", outline: 2, path: "M224 113 L249 122 Q235 133 240 151 Q226 156 216 146 Q213 128 224 113 Z" },
  { id: "rear-near", x: 0, y: 0, outline: 3, path: "M133 194 Q143 178 164 190 Q177 203 163 229 L158 252 L164 267 Q153 277 125 269 Q121 263 131 255 L135 231 Q121 210 133 194 Z" },
  { id: "front-near", x: 0, y: 0, outline: 3, path: "M253 195 Q268 182 284 196 L278 231 L288 265 Q279 274 252 268 Q246 262 254 255 L247 225 Z" },
  { id: "frill", x: 0, y: 0, outline: 3, path: "M300 214 Q281 211 282 194 Q264 191 270 173 Q253 161 265 146 Q251 130 267 117 Q258 99 277 91 Q274 73 294 71 Q300 53 318 66 Q333 55 345 72 Q365 69 367 89 Q384 97 374 114 Q386 131 370 143 Q374 166 353 179 Q334 213 300 214 Z" },
  { id: "frill-panel-low", x: 0, y: 0, parent: "frill", outline: 2, path: "M285 177 Q277 185 286 193 Q292 206 308 202 L317 174 L303 161 Z" },
  { id: "frill-panel-left", x: 0, y: 0, parent: "frill", outline: 2, path: "M273 126 Q262 138 278 151 L301 158 L309 142 L291 125 Z" },
  { id: "frill-panel-crown", x: 0, y: 0, parent: "frill", outline: 2, path: "M286 88 Q281 105 297 118 L313 136 L324 119 L313 88 Q299 74 286 88 Z" },
  { id: "frill-panel-high", x: 0, y: 0, parent: "frill", outline: 2, path: "M331 80 Q322 90 333 119 L346 133 L359 116 Q368 96 353 87 Z" },
  { id: "head", x: 0, y: 0, outline: 3, path: "M325 143 Q347 131 367 150 Q376 166 398 174 L419 180 Q435 190 422 207 L398 213 Q380 233 352 220 Q332 221 323 199 Q311 177 325 143 Z" },
  { id: "cheek", x: 0, y: 0, parent: "head", outline: 2, path: "M337 178 Q353 175 365 189 L376 210 Q358 222 343 207 Q330 197 337 178 Z" },
  { id: "beak", x: 0, y: 0, parent: "head", outline: 2.5, path: "M399 174 Q389 190 401 213 L424 213 L438 183 Z" },
  { id: "horn-far", x: 0, y: 0, outline: 3, path: "M329 145 Q340 112 383 88 Q365 119 350 155 Q337 160 329 145 Z" },
  { id: "horn-near", x: 0, y: 0, outline: 3, path: "M355 155 Q378 126 417 112 Q400 139 376 171 Q362 174 355 155 Z" },
  { id: "horn-nose", x: 0, y: 0, outline: 3, path: "M404 179 Q415 154 433 148 Q433 169 422 188 Q410 190 404 179 Z" },
  { id: "cycad-trunk", x: 0, y: 0, outline: 2.5, path: "M56 118 L67 115 L76 228 Q66 234 56 228 L60 167 Z" },
  { id: "cycad-left-low", x: 0, y: 0, outline: 2.5, path: "M62 117 Q25 111 18 153 Q42 154 62 117 Z" },
  { id: "cycad-left-high", x: 0, y: 0, outline: 2.5, path: "M62 117 Q27 114 24 82 Q54 79 62 117 Z" },
  { id: "cycad-crown", x: 0, y: 0, outline: 2.5, path: "M62 117 Q44 88 65 69 Q85 91 62 117 Z" },
  { id: "cycad-right-high", x: 0, y: 0, outline: 2.5, path: "M62 117 Q67 81 101 83 Q105 108 62 117 Z" },
  { id: "cycad-right-low", x: 0, y: 0, outline: 2.5, path: "M62 117 Q101 106 109 143 Q82 150 62 117 Z" },
  { id: "fern-left", x: 0, y: 0, outline: 2.5, path: "M403 281 Q376 278 370 247 Q397 246 403 281 Z" },
  { id: "fern-crown", x: 0, y: 0, outline: 2.5, path: "M403 281 Q387 251 406 228 Q428 251 403 281 Z" },
  { id: "fern-right", x: 0, y: 0, outline: 2.5, path: "M403 281 Q410 251 439 250 Q438 277 403 281 Z" },
  { id: "rock", x: 0, y: 0, outline: 2.5, path: "M202 277 L215 257 L235 254 L251 271 L244 284 L210 284 Z" }
];
const details: readonly ProtectedDetail[] = [
  { x: 360, y: 176, width: 8, height: 11, rotation: 12, fill: "#091e40" },
  { x: 362, y: 177, width: 2.5, height: 3, rotation: 0, fill: "#ffffff" },
  { x: 411, y: 193, width: 4, height: 3, rotation: 0, fill: "#091e40" },
  { x: 0, y: 0, path: "M382 202 Q391 207 399 201 M354 170 Q361 166 368 171 M132 269 L134 262 M144 271 L145 263 M156 268 L155 262 M259 269 L260 261 M271 270 L271 262 M281 268 L280 261 M169 260 L170 253 M181 261 L180 254 M295 258 L294 251 M306 258 L303 251", stroke: "#091e40", strokeWidth: 1.8 },
  { x: 0, y: 0, path: "M61 126 L65 145 L61 161 L68 179 L62 196 L71 214 M28 140 L56 120 M32 89 L57 111 M65 79 L63 108 M91 90 L70 111 M99 135 L71 120 M378 255 L398 275 M406 238 L404 270 M431 258 L411 275 M214 278 L222 266 L235 263 M327 275 Q345 271 359 277", stroke: "#091e40", strokeWidth: 1.5 }
];

export const TRICERATOPS_EXPLORER: Geometry = {
  artwork: Object.freeze({ version: "triceratops-explorer-1", regions: Object.freeze(regions.map(region => region.id)) }),
  regions, details
};
