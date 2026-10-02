import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { it } from 'node:test';

const SCRIPT = resolve('scripts/claude-session.py');

const lines = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

// A projects dir with Finder's .DS_Store files where macOS drops them: in the
// projects dir, a project dir, the session dir and its subagents dir.
function withProjects(fn) {
  const root = mkdtempSync(join(tmpdir(), 'claude-session-test-'));
  try {
    const project = join(root, '-Users-x-repo');
    const subagents = join(project, 'first', 'subagents');
    mkdirSync(join(subagents, 'workflows', 'wf_1'), { recursive: true });
    for (const dir of [root, project, join(project, 'first'), subagents]) {
      writeFileSync(join(dir, '.DS_Store'), Buffer.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31]));
    }
    writeFileSync(
      join(project, 'first.jsonl'),
      lines(
        { type: 'ai-title', aiTitle: 'repo-status', sessionId: 'first' },
        { type: 'user', timestamp: '2026-10-01T10:00:00Z', message: { content: '<local-command-caveat>x</local-command-caveat>' } },
        { type: 'user', timestamp: '2026-10-01T10:00:01Z', message: { content: 'build the thing' } },
        {
          type: 'assistant', timestamp: '2026-10-01T10:00:02Z',
          message: { content: [{ type: 'text', text: 'Building.' }, { type: 'tool_use', name: 'Bash', input: { command: 'make', description: 'Build it' } }] },
        },
        { type: 'user', timestamp: '2026-10-01T10:00:03Z', message: { content: [{ type: 'tool_result', content: 'x'.repeat(50) }] } },
        { type: 'attachment', timestamp: '2026-10-01T10:00:04Z', attachment: { type: 'queued_command', prompt: 'also test it' } },
        {
          type: 'attachment', timestamp: '2026-10-01T10:00:05Z',
          attachment: { type: 'queued_command', prompt: '<task-notification>\n<summary>Agent "Builder" finished</summary>\n</task-notification>' },
        },
        { type: 'user', timestamp: '2026-10-01T11:00:00Z', isCompactSummary: true, message: { content: 'Summary: built.' } },
        { type: 'continued-in', continuedInSessionId: 'second' },
      ),
    );
    writeFileSync(
      join(project, 'second.jsonl'),
      lines({ type: 'user', timestamp: '2026-10-01T12:00:00Z', message: { content: 'ship it' } }),
    );
    writeFileSync(join(subagents, 'agent-a1.jsonl'), '');
    writeFileSync(join(subagents, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Judge review' }));
    writeFileSync(join(subagents, 'workflows', 'wf_1', 'agent-b2.meta.json'), JSON.stringify({ agentType: 'workflow', description: 'Verify' }));
    return fn(root, subagents);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
}

const run = (root, ...args) =>
  spawnSync('python3', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECTS_DIR: root } });

it('finds a session by title past Finder files and reads it on into its continuation', () => {
  withProjects((root) => {
    const result = run(root, 'repo-status', '--width', '10');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /OWNER: build the thing/);
    assert.match(result.stdout, /CLAUDE: Building\./);
    assert.match(result.stdout, /TOOL: Bash: Buil … \[4 more chars\]/);
    assert.match(result.stdout, /RESULT: x{10} … \[40 more chars\]/);
    assert.match(result.stdout, /OWNER: also test it/);
    assert.match(result.stdout, /NOTIFY: Agent "Builder" finished/);
    assert.match(result.stdout, /COMPACTED: Summary: built\./);
    assert.match(result.stdout, /\[2026-10-01 12:00:00\] OWNER: ship it/);
    assert.doesNotMatch(result.stdout, /local-command-caveat/);
  });
});

it('shows only what the owner typed with --owner', () => {
  withProjects((root) => {
    const result = run(root, 'first', '--owner');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      result.stdout.trim().split('\n').map((l) => l.replace(/^\[[^\]]*\] /, '')),
      ['OWNER: build the thing', 'OWNER: also test it', 'OWNER: ship it'],
    );
  });
});

it('lists subagents, nested ones too, skipping .DS_Store', () => {
  withProjects((root) => {
    const result = run(root, 'first', '--subagents');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^agent-a1 {2}general-purpose {2}Judge review$/m);
    assert.match(result.stdout, /^workflows\/wf_1\/agent-b2 {2}workflow {2}Verify$/m);
  });
});

it('names any other stray file in the subagents dir and fails', () => {
  withProjects((root, subagents) => {
    writeFileSync(join(subagents, 'notes.txt'), 'stray');
    const result = run(root, 'first', '--subagents');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected file .*subagents\/notes\.txt/);
    assert.match(result.stdout, /agent-a1/);
  });
});

it('fails by name for an unknown session', () => {
  withProjects((root) => {
    const result = run(root, 'no-such-session');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no session with id or title 'no-such-session'/);
  });
});
