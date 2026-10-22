import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetadataSync } from '../repo-metadata.js';

const settings = { repo: 'someone/game', description: 'A game', homepage: 'https://example.test', topics: ['react', 'game'] };

for (const { current, removed } of [
  { current: { repositoryTopics: [{ name: 'obsolete' }, { name: 'react' }] }, removed: ['obsolete'] },
  { current: { repositoryTopics: [] }, removed: [] },
  { current: { repositoryTopics: null }, removed: [] },
  { current: {}, removed: [] }
]) {
  test(`metadata sync sets description, homepage and exactly the listed topics: ${JSON.stringify(current)}`, () => {
    const calls = [];
    const syncMetadata = createMetadataSync({ run: (command, args, options) => {
      calls.push({ command, args, ...options });
      return args[1] === 'view' ? Buffer.from(JSON.stringify(current)) : Buffer.alloc(0);
    } });

    syncMetadata(settings, { cwd: '/clone' });

    assert.deepEqual(calls, [
      { command: 'gh', args: ['repo', 'view', 'someone/game', '--json', 'repositoryTopics'], cwd: '/clone' },
      { command: 'gh', args: ['repo', 'edit', 'someone/game', '--description', 'A game', '--homepage', 'https://example.test',
        '--add-topic', 'react', '--add-topic', 'game', ...removed.flatMap((topic) => ['--remove-topic', topic])], cwd: '/clone' }
    ]);
  });
}

for (const stage of ['view', 'edit']) {
  test(`metadata sync propagates a failed gh ${stage}`, () => {
    const error = new Error(`${stage}: diagnostic output`);
    const calls = [];
    const syncMetadata = createMetadataSync({ run: (command, args) => {
      calls.push(args[1]);
      if (args[1] === stage) throw error;
      return Buffer.from('{"repositoryTopics":[]}');
    } });

    assert.throws(() => syncMetadata(settings, { cwd: '/clone' }), (actual) => actual === error);
    assert.deepEqual(calls, stage === 'view' ? ['view'] : ['view', 'edit']);
  });
}
