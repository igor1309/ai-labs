import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('nomos landing surfaces faq client routing boundaries', () => {
  const landingHtml = readFileSync('nomos/index.html', 'utf8');
  const expectedSignals = [
    'href="docs/faq.md"',
    'Clients choose concrete model strings',
    'Provider and vendor routing stay in service configuration',
    'No fallback chain on budget exhaustion',
  ];

  assert.deepEqual(
    expectedSignals.map((signal) => ({
      signal,
      present: landingHtml.includes(signal),
    })),
    expectedSignals.map((signal) => ({ signal, present: true }))
  );
});
