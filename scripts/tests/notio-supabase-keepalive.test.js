import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { it } from 'node:test';

const workflow = readFileSync('.github/workflows/notio-supabase-keepalive.yml', 'utf8');
const script = workflow.split('        run: |\n')[1].split('\n  notify:')[0]
  .split('\n').map(line => line.replace(/^          /, '')).join('\n');

for (const [body, curlExit, expected] of [['[{"id":1}]', 0, 0], ['[]', 0, 1], ['', 22, 1]]) {
  it(`heartbeat response ${JSON.stringify(body)}, curl exit ${curlExit}: exits ${expected}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'notio-heartbeat-'));
    try {
      writeFileSync(join(directory, 'curl'), '#!/bin/sh\nprintf \'%s\' "$MOCK_BODY"\nexit "$MOCK_EXIT"\n', { mode: 0o755 });
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, MOCK_BODY: body,
          MOCK_EXIT: String(curlExit), SUPABASE_URL: 'https://example.test', SUPABASE_KEY: 'test' },
      });
      assert.equal(result.status, expected, result.stdout + result.stderr);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
