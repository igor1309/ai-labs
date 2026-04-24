import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'node:test';

it('reports docs-only components as regular LOC rows', () => {
  const output = execFileSync('bash', ['scripts/loc-dashboard.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.deepEqual(
    projectRows(output)
      .filter((line) => /^(nexum|niora|regentara)\s/.test(line.trim()))
      .map((line) => line.trim().split(/\s+/).slice(0, 3)),
    [
      ['nexum', '0', '0'],
      ['niora', '0', '0'],
      ['regentara', '0', '0'],
    ]
  );
});

it('counts scripts tests in the repo-scripts test total', () => {
  const output = execFileSync('bash', ['scripts/loc-dashboard.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const repoScriptsRow = output
    .split('\n')
    .find((line) => line.trimStart().startsWith('repo-scripts'));
  const actualTests = Number(repoScriptsRow.trim().split(/\s+/)[2]);

  assert.equal(actualTests, countRepoLevelTests());
});

it('sorts rows by total when requested', () => {
  const output = execFileSync('bash', ['scripts/loc-dashboard.sh', '--sort=total'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const totals = projectRows(output).map((line) =>
    Number(line.trim().split(/\s+/).at(-1))
  );

  assert.deepEqual(
    totals,
    [...totals].sort((left, right) => right - left)
  );
});

function countRepoLevelTests() {
  return countTestsInDirectory('tests') + countTestsInDirectory('scripts/tests');
}

function projectRows(output) {
  const lines = output.split('\n');
  const headerIndex = lines.findIndex((line) =>
    line.trimStart().startsWith('project')
  );

  return lines
    .slice(headerIndex + 2)
    .filter((line) => line.trim() && !line.startsWith('─'))
    .filter((line) => !line.trimStart().startsWith('TOTAL'))
    .filter((line) => !line.trimStart().startsWith('test/code ratio'))
    .filter((line) => !line.trimStart().startsWith('⚠'));
}

function countTestsInDirectory(directory) {
  return walk(directory).reduce((total, filePath) => {
    if (!isTestFile(filePath)) {
      return total;
    }

    return total + countLines(filePath);
  }, 0);
}

function walk(directory) {
  try {
    return readdirSync(directory).flatMap((entry) => {
      const filePath = join(directory, entry);

      if (statSync(filePath).isDirectory()) {
        return walk(filePath);
      }

      return filePath;
    });
  } catch {
    return [];
  }
}

function isTestFile(filePath) {
  return (
    filePath.endsWith('.test.js') ||
    filePath.endsWith('.test.ts') ||
    filePath.endsWith('.py')
  );
}

function countLines(filePath) {
  return readFileSync(filePath, 'utf8').split('\n').length - 1;
}
