import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/release-unit.yml'),
  'utf8',
);

describe('release-unit workflow fan-in', () => {
  it('includes split Notio jobs in release and notification fan-in', () => {
    const requiredJobs = [
      'test-notio-backend',
      'deploy-notio-backend',
      'deploy-notio-frontend',
    ];
    const fanInSections = [
      jobSection('github-release'),
      jobSection('notify'),
    ];

    for (const section of fanInSections) {
      for (const job of requiredJobs) {
        assert.ok(section.includes(job), `${sectionName(section)} missing ${job}`);
      }
    }
  });

  it('includes Agonara deploy jobs in release and notification fan-in', () => {
    const requiredJobs = [
      'deploy-agonara-staging',
      'deploy-agonara-prod',
    ];
    const fanInSections = [
      jobSection('github-release'),
      jobSection('notify'),
    ];

    for (const section of fanInSections) {
      for (const job of requiredJobs) {
        assert.ok(section.includes(job), `${sectionName(section)} missing ${job}`);
      }
    }
  });

  it('requires successful Agonara deploy jobs before GitHub release', () => {
    const githubRelease = jobSection('github-release');

    assert.ok(githubRelease.includes("needs.verify.outputs.basename != 'agonara'"));
    assert.ok(githubRelease.includes("needs.deploy-agonara-staging.result == 'success'"));
    assert.ok(githubRelease.includes("needs.deploy-agonara-prod.result == 'success'"));
  });

  it('fails fast when Agonara deploy secrets are missing', () => {
    const stagingDeploy = jobSection('deploy-agonara-staging');

    assert.ok(stagingDeploy.includes('Verify Agonara deploy secrets'));
    assert.ok(stagingDeploy.includes('AGONARA_VPS_HOST: ${{ secrets.AGONARA_VPS_HOST }}'));
    assert.ok(stagingDeploy.includes('AGONARA_VPS_USER: ${{ secrets.AGONARA_VPS_USER }}'));
    assert.ok(stagingDeploy.includes('AGONARA_VPS_SSH_KEY: ${{ secrets.AGONARA_VPS_SSH_KEY }}'));
    assert.ok(stagingDeploy.includes('::error::${name} is required for Agonara release deploy'));
  });

  it('reports split Notio jobs in failure notifications', () => {
    const notify = jobSection('notify');

    assert.ok(notify.includes('test-notio-backend=${{ needs.test-notio-backend.result }}'));
    assert.ok(notify.includes('deploy-notio-backend=${{ needs.deploy-notio-backend.result }}'));
    assert.ok(notify.includes('deploy-notio-frontend=${{ needs.deploy-notio-frontend.result }}'));
  });

  it('reports Agonara deploy jobs in failure notifications', () => {
    const notify = jobSection('notify');

    assert.ok(notify.includes('deploy-agonara-staging=${{ needs.deploy-agonara-staging.result }}'));
    assert.ok(notify.includes('deploy-agonara-prod=${{ needs.deploy-agonara-prod.result }}'));
  });
});

function jobSection(jobName) {
  const match = workflow.match(new RegExp(`\\n  ${jobName}:\\n[\\s\\S]*?(?=\\n  [a-zA-Z0-9_-]+:\\n|\\n?$)`));
  assert.ok(match, `missing ${jobName} job`);
  return match[0];
}

function sectionName(section) {
  return section.match(/\n  ([^:]+):/)?.[1] ?? 'section';
}
