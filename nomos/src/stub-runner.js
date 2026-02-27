import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function createStubRunner({ fixturesDir } = {}) {
  if (!fixturesDir) {
    throw new Error("fixturesDir is required");
  }

  const resolvedFixturesDir = resolve(fixturesDir);

  async function loadFixture(filename) {
    const filePath = join(resolvedFixturesDir, filename);
    if (!filePath.startsWith(resolvedFixturesDir)) {
      throw new Error(`invalid model name: path traversal detected`);
    }
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
