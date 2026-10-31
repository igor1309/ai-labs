import type { Geometry, PaintRegion, ProtectedDetail } from "./geometry.ts";

// Far legs and plates sit behind the body; inset panels are clipped to their
// plate so each visible space keeps its own fill and enclosing outline.
const regions: readonly PaintRegion[] = [
  { id: "sun", x: 43, y: 25, width: 44, height: 44, rotation: 0, outline: 2.5 },
  { id: "cloud", x: 0, y: 0, outline: 2.5, path: "M330 55 C315 55 313 40 326 36 C325 21 345 18 352 31 C365 22 380 29 378 41 C397 40 398 58 381 59 Z" },
  { id: "volcano", x: 0, y: 0, outline: 2.5, path: "M338 153 L378 87 L397 88 L441 153 Z" },
  { id: "crater", x: 0, y: 0, parent: "volcano", outline: 2, path: "M367 105 L378 87 L397 88 L409 106 L394 101 L385 108 L378 100 Z" },
  { id: "meadow", x: 0, y: 0, outline: 2.5, path: "M14 252 Q81 234 149 249 Q231 232 302 248 Q375 231 446 248 L446 296 L14 296 Z" },
  { id: "stream", x: 0, y: 0, parent: "meadow", outline: 2, path: "M337 241 Q310 260 352 268 Q379 279 359 296 L283 296 Q329 278 300 269 Q276 254 310 243 Z" },
  { id: "rear-far", x: 0, y: 0, outline: 3, path: "M264 208 L291 209 L298 249 L306 263 Q296 272 276 266 L272 244 Z" },
  { id: "front-far", x: 0, y: 0, outline: 3, path: "M148 212 L171 211 L177 248 L174 265 Q158 272 143 264 L152 246 Z" },
  { id: "tail", x: 0, y: 0, outline: 3, path: "M278 172 Q342 190 420 152 Q413 179 377 195 Q336 219 285 218 Z" },
  { id: "spike-upper-far", x: 0, y: 0, outline: 2.5, path: "M397 164 Q389 149 391 129 Q409 141 411 158 Z" },
  { id: "spike-lower-far", x: 0, y: 0, outline: 2.5, path: "M403 171 Q416 181 418 201 Q399 193 393 178 Z" },
  { id: "spike-upper-near", x: 0, y: 0, outline: 2.5, path: "M412 157 Q416 138 435 127 Q435 148 424 163 Z" },
  { id: "spike-lower-near", x: 0, y: 0, outline: 2.5, path: "M418 165 Q435 166 444 182 Q425 184 411 175 Z" },
  { id: "plate-1", x: 0, y: 0, outline: 3, path: "M108 164 L98 141 Q95 127 102 118 Q119 121 128 137 L133 154 Z" },
  { id: "plate-2", x: 0, y: 0, outline: 3, path: "M132 145 Q114 122 119 103 L139 83 Q160 96 165 115 L159 137 Z" },
  { id: "plate-3", x: 0, y: 0, outline: 3, path: "M163 133 Q145 107 152 83 L176 55 Q201 69 208 94 L199 123 Z" },
  { id: "plate-4", x: 0, y: 0, outline: 3, path: "M202 124 Q192 97 206 70 L234 42 Q258 66 259 93 L244 128 Z" },
  { id: "plate-5", x: 0, y: 0, outline: 3, path: "M247 131 L254 96 Q268 75 288 66 Q306 89 299 113 L281 144 Z" },
  { id: "plate-6", x: 0, y: 0, outline: 3, path: "M282 151 L302 118 L324 102 Q339 122 329 142 L312 165 Z" },
  { id: "plate-7", x: 0, y: 0, outline: 3, path: "M319 178 L338 151 L356 140 Q368 156 356 171 L344 184 Z" },
  { id: "plate-8", x: 0, y: 0, outline: 2.5, path: "M357 180 L367 159 L379 153 L383 167 L377 179 Z" },
  { id: "plate-panel-2", x: 0, y: 0, parent: "plate-2", outline: 2, path: "M132 109 L139 97 Q152 106 153 117 L145 128 L134 122 Z" },
  { id: "plate-panel-3", x: 0, y: 0, parent: "plate-3", outline: 2, path: "M164 88 L178 72 Q192 83 194 95 L186 113 L173 108 Z" },
  { id: "plate-panel-4", x: 0, y: 0, parent: "plate-4", outline: 2, path: "M215 82 L234 61 Q247 78 246 92 L235 112 L221 106 Z" },
  { id: "plate-panel-5", x: 0, y: 0, parent: "plate-5", outline: 2, path: "M267 103 Q275 90 285 84 Q294 99 286 112 L277 127 L265 118 Z" },
  { id: "body", x: 0, y: 0, outline: 3, path: "M109 172 Q139 125 193 121 C239 113 281 135 304 169 Q325 199 297 223 Q259 245 204 237 Q143 237 115 211 Q103 196 109 172 Z" },
  { id: "flank", x: 0, y: 0, parent: "body", outline: 2, path: "M161 181 Q195 159 236 172 Q270 181 282 205 Q253 226 211 224 Q182 223 161 206 Z" },
  { id: "shoulder-patch", x: 0, y: 0, parent: "body", outline: 2, path: "M122 159 Q132 142 148 139 Q158 145 154 158 Q143 176 129 179 Z" },
  { id: "back-patch", x: 0, y: 0, parent: "body", outline: 2, path: "M179 134 Q198 126 214 133 L216 148 Q200 157 183 150 Z" },
  { id: "hip-patch", x: 0, y: 0, parent: "body", outline: 2, path: "M250 143 Q270 146 280 161 L271 177 L251 165 Z" },
  { id: "rear-near", x: 0, y: 0, outline: 3, path: "M257 210 Q274 197 288 213 Q296 228 285 246 L286 263 L294 274 Q276 285 253 276 Q248 270 256 263 L260 245 Q248 228 257 210 Z" },
  { id: "front-near", x: 0, y: 0, outline: 3, path: "M178 215 Q192 201 207 216 L203 246 L210 272 Q194 282 172 274 Q168 268 176 263 L180 244 Z" },
  { id: "neck", x: 0, y: 0, outline: 3, path: "M119 166 Q104 184 86 187 L79 211 Q105 232 137 217 Q147 204 136 187 Z" },
  { id: "head", x: 0, y: 0, outline: 3, path: "M93 181 Q72 170 57 185 L39 194 Q31 207 46 216 L72 217 Q94 227 108 209 Q115 193 93 181 Z" },
  { id: "cheek", x: 0, y: 0, parent: "head", outline: 2, path: "M84 197 Q96 193 102 204 Q96 219 83 214 Q76 207 84 197 Z" },
  { id: "horsetail-stem", x: 0, y: 0, outline: 2.5, path: "M402 227 L411 226 L415 276 L403 278 Z" },
  { id: "horsetail-left", x: 0, y: 0, outline: 2.5, path: "M407 242 Q376 238 374 213 Q399 212 407 242 Z" },
  { id: "horsetail-crown", x: 0, y: 0, outline: 2.5, path: "M407 242 Q389 218 405 195 Q426 217 407 242 Z" },
  { id: "horsetail-right", x: 0, y: 0, outline: 2.5, path: "M407 242 Q415 213 441 215 Q440 239 407 242 Z" },
  { id: "fern-left", x: 0, y: 0, outline: 2.5, path: "M68 281 Q36 279 27 249 Q55 246 68 281 Z" },
  { id: "fern-crown", x: 0, y: 0, outline: 2.5, path: "M68 281 Q48 255 64 233 Q84 251 68 281 Z" },
  { id: "fern-right", x: 0, y: 0, outline: 2.5, path: "M68 281 Q74 251 101 249 Q101 274 68 281 Z" },
  { id: "rock", x: 0, y: 0, outline: 2.5, path: "M105 285 L113 267 L131 263 L144 277 L137 289 Z" }
];

const details: readonly ProtectedDetail[] = [
  { x: 72, y: 186, width: 7, height: 9, rotation: 0, fill: "#091e40" },
  { x: 73, y: 187, width: 2, height: 2.5, rotation: 0, fill: "#ffffff" },
  { x: 45, y: 198, width: 3, height: 2.5, rotation: 0, fill: "#091e40" },
  { x: 0, y: 0, path: "M49 207 Q59 214 70 206 M70 181 Q76 178 81 182 M148 265 L150 259 M160 267 L161 260 M284 266 L283 259 M296 265 L293 259 M180 275 L182 268 M192 277 L192 269 M203 275 L201 268 M261 277 L263 269 M273 279 L273 271 M285 277 L282 270", stroke: "#091e40", strokeWidth: 1.8 },
  { x: 0, y: 0, path: "M405 254 L412 254 M405 266 L413 266 M383 221 L400 237 M405 205 L407 233 M432 223 L414 237 M37 256 L60 276 M64 243 L66 270 M91 257 L76 274 M115 280 L121 273 L131 272 M322 285 Q332 282 341 286", stroke: "#091e40", strokeWidth: 1.5 }
];

export const STEGOSAURUS_EXPLORER: Geometry = {
  artwork: Object.freeze({ version: "stegosaurus-explorer-1", regions: Object.freeze(regions.map(region => region.id)) }),
  regions, details
};
