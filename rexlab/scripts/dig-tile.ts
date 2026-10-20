import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Bake the home art once: the shipped Stegosaurus half buried in sand.
// The runtime loads only the webp, with no sand rendering on the home page.
const root = new URL("../", import.meta.url);
const width = 800;
const height = 600;
let seed = 7;
const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const grains = Array.from({ length: 1500 }, () => {
  const x = random() * width;
  const y = random() * height;
  const r = 0.5 + random() * 1.5;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${random() < 0.5 ? "#b98f55" : "#e8cc98"}"/>`;
}).join("");
const sand = Buffer.from(`<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs><mask id="sand"><rect width="800" height="600" fill="white"/>
    <path d="M0 0 H800 V320 Q650 380 460 310 Q250 460 0 355 Z" fill="black"/>
  </mask></defs><g mask="url(#sand)"><rect width="800" height="600" fill="#d9b77e"/>${grains}</g>
</svg>`);
await mkdir(new URL("src/assets/dig/", root), { recursive: true });
await sharp(fileURLToPath(new URL("src/assets/dinos/stegosaurus/body.webp", root)))
  .resize(width, height).flatten({ background: "#d9b77e" })
  .composite([{ input: sand }]).webp({ quality: 90 })
  .toFile(fileURLToPath(new URL("src/assets/dig/tile.webp", root)));
