import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function createStubRunner({ fixturesDir } = {}) {
  if (!fixturesDir) {
    throw new Error("fixturesDir is required");
  }

  async function loadFixture(filename) {
    const filePath = join(fixturesDir, filename);
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  }

  return {
    async execute(request) {
      return loadFixture(`${request.model}.json`);
    },

    async *executeStream(request) {
      const fixture = await loadFixture(`${request.model}.stream.json`);
      for (const event of fixture.events) {
        yield event;
      }
    },
  };
}
