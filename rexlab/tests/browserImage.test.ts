import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("browser contracts in CI", () => {
  it("run in the Playwright image of the playwright version the app installs", () => {
    const { devDependencies, dependencies } = JSON.parse(read("../package.json"));
    const version = devDependencies?.playwright ?? dependencies?.playwright;
    const images = [...read("../../.github/workflows/rexlab-core.yml").matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/g)].map(match => match[1]);

    expect(images).toEqual([version]);
  });
});
