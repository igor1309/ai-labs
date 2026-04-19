import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'node:test';

it('reports docs-only components omitted from LOC rows', () => {
  const output = execFileSync('bash', ['scripts/loc-dashboard.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.match(
    output,
    /omitted docs-only\/pre-implementation dirs \(no code\/tests\/scripts\): nexum niora/
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
  const actualTests = Number(repoScriptsRow.trim().split(/\s+/)[4]);

  assert.equal(actualTests, countRepoLevelTests());
});

function countRepoLevelTests() {
  return countTestsInDirectory('tests') + countTestsInDirectory('scripts/tests');
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
