/**
 * StubRunner — deterministic runner implementation for testing.
 *
 * Runner protocol (owned by its client, the route handler):
 *   execute(request)       → Promise<object>          (non-streaming response)
 *   executeStream(request) → AsyncGenerator<object>    (streaming SSE events)
 *
 * request shape:  { model: string, messages: array, stream?: boolean, ...options }
 * execute return: complete response object (OpenAI chat.completion shape)
 * executeStream yields: { type: 'chunk'|'error'|'end', data?: object }
 *
 * Fixtures are loaded from the filesystem (read-only in V0).
 * Non-streaming fixture:  {fixturesDir}/{model}.json
 * Streaming fixture:      {fixturesDir}/{model}.stream.json
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function createStubRunner({ fixturesDir }) {
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
