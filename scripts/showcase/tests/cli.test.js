import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCLI } from '../export.js';

for (const { args, project, push } of [
  { args: ['game'], project: 'game', push: false },
  { args: ['products/game'], project: 'products/game', push: false },
  { args: ['game', '--push'], project: 'game', push: true },
  { args: ['--push', 'products/game'], project: 'products/game', push: true }
]) {
  test(`CLI forwards ${args.join(' ')} and prints the exported directory`, () => {
    const output = [];
    const errors = [];
    const stdout = (message) => output.push(message);
    const stderr = (message) => errors.push(message);
    const calls = [];
    const run = (command, argv, options) => {
      calls.push({ command, args: argv, ...options });
      return Buffer.from('/source/root\n');
    };
    const exitCode = handleCLI(args, {
      cwd: '/source/root/nested', run, stdout, stderr,
      exportProject: (options, collaborators) => {
        calls.push({ options });
        assert.deepEqual(options, { root: '/source/root', project, push });
        assert.deepEqual(collaborators, { run, log: stderr });
        collaborators.log('check output');
        return '/temporary/exported-project';
      }
    });
    assert.equal(exitCode, 0);
    assert.deepEqual(calls, [
      { command: 'git', args: ['rev-parse', '--show-toplevel'], cwd: '/source/root/nested' },
      { options: { root: '/source/root', project, push } }
    ]);
    assert.deepEqual(output, ['/temporary/exported-project']);
    assert.deepEqual(errors, ['check output']);
  });
}

for (const args of [[], ['--push'], ['game', 'extra'], ['game', '--push', '--push'], ['--push', '--push']]) {
  test(`CLI rejects invalid arguments ${JSON.stringify(args)} before running collaborators`, () => {
    const errors = [];
    const exitCode = handleCLI(args, {
      cwd: '/source/root',
      run: () => assert.fail('invalid arguments must not run git'),
      exportProject: () => assert.fail('invalid arguments must not export'),
      stdout: () => assert.fail('invalid arguments must not print a directory'),
      stderr: (message) => errors.push(message)
    });
    assert.equal(exitCode, 1);
    assert.deepEqual(errors, ['Usage: node scripts/showcase/export.js <project> [--push]']);
  });
}

for (const stage of ['root lookup', 'export']) {
  test(`CLI reports ${stage} failure and returns a nonzero exit code`, () => {
    const errors = [];
    const failure = new Error(`${stage}: diagnostic output`);
    let exports = 0;
    const exitCode = handleCLI(['game', '--push'], {
      cwd: '/source/root',
      run: () => {
        if (stage === 'root lookup') throw failure;
        return Buffer.from('/source/root\n');
      },
      exportProject: () => {
        exports++;
        throw failure;
      },
      stdout: () => assert.fail('failure must not print a directory'),
      stderr: (message) => errors.push(message)
    });
    assert.equal(exitCode, 1);
    assert.equal(exports, stage === 'export' ? 1 : 0);
    assert.deepEqual(errors, [failure.message]);
  });
}
