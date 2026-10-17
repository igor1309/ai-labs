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

  it('includes FolioTell test and TestFlight jobs in release and notification fan-in', () => {
    const requiredJobs = [
      'test-foliotell',
      'deploy-foliotell-testflight',
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

  it('includes the RexLab deploy in release and notification fan-in', () => {
    for (const section of [jobSection('github-release'), jobSection('notify')]) {
      assert.ok(section.includes('deploy-rexlab'), `${sectionName(section)} missing deploy-rexlab`);
    }
    assert.ok(jobSection('notify').includes('deploy-rexlab=${{ needs.deploy-rexlab.result }}'));
  });

  it('requires a successful RexLab deploy before GitHub release', () => {
    const githubRelease = jobSection('github-release');

    assert.ok(githubRelease.includes("needs.verify.outputs.basename != 'rexlab'"));
    assert.ok(githubRelease.includes("needs.deploy-rexlab.result == 'success'"));
  });

  it('releases RexLab through its own deploy workflow, not the root core job', () => {
    assert.ok(jobSection('core').includes("needs.verify.outputs.basename != 'rexlab'"));
    assert.ok(jobSection('deploy-rexlab').includes('uses: ./.github/workflows/rexlab-deploy.yml'));
  });

  it('requires successful FolioTell TestFlight upload before GitHub release', () => {
    const githubRelease = jobSection('github-release');

    assert.ok(githubRelease.includes("needs.verify.outputs.basename != 'foliotell'"));
    assert.ok(githubRelease.includes("needs.deploy-foliotell-testflight.result == 'success'"));
  });

  it('validates and publishes checked-in FolioTell release notes', () => {
    const verify = jobSection('verify');
    const githubRelease = jobSection('github-release');

    assert.ok(verify.includes('Validate FolioTell release notes'));
    assert.ok(verify.includes('node scripts/release/validate-foliotell-release-notes.js'));
    assert.ok(githubRelease.includes('Checkout release contents'));
    assert.ok(githubRelease.includes('foliotell/ios/docs/releases/${RELEASE_VERSION}.md'));
    assert.ok(githubRelease.includes('awk \'NR == 1 && $0 == "---"'));
    assert.ok(githubRelease.includes('bodyFile: ${{ env.RELEASE_BODY_FILE }}'));
  });

  it('fails fast when FolioTell TestFlight secrets are missing', () => {
    const deploy = jobSection('deploy-foliotell-testflight');

    assert.ok(deploy.includes('Verify FolioTell TestFlight secrets'));
    assert.ok(deploy.includes('FOLIOTELL_ASC_API_KEY_ID: ${{ secrets.FOLIOTELL_ASC_API_KEY_ID }}'));
    assert.ok(deploy.includes('FOLIOTELL_ASC_API_ISSUER_ID: ${{ secrets.FOLIOTELL_ASC_API_ISSUER_ID }}'));
    assert.ok(deploy.includes('FOLIOTELL_ASC_API_PRIVATE_KEY: ${{ secrets.FOLIOTELL_ASC_API_PRIVATE_KEY }}'));
    assert.ok(deploy.includes('::error::${name} is required for FolioTell TestFlight release'));
  });

  it('pins FolioTell TestFlight upload to the declared Apple team', () => {
    const deploy = jobSection('deploy-foliotell-testflight');

    assert.ok(deploy.includes('FOLIOTELL_PROVIDER_ID: VRVJ9YNRQU'));
    assert.ok(deploy.includes('FOLIOTELL_TEAM_ID: VRVJ9YNRQU'));
    assert.ok(deploy.includes('scripts/distribute-testflight.sh --upload'));
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

  it('uploads Agonara package lock for reproducible VPS image builds', () => {
    const stagingDeploy = jobSection('deploy-agonara-staging');

    assert.ok(stagingDeploy.includes('agonara/package-lock.json'));
  });

  it('cleans Agonara deploy upload before copying source', () => {
    const stagingDeploy = jobSection('deploy-agonara-staging');

    assert.ok(stagingDeploy.includes('Prepare clean Agonara deploy upload'));
    assert.ok(stagingDeploy.includes('rm -rf /tmp/agonara-deploy'));
    assert.ok(stagingDeploy.indexOf('Prepare clean Agonara deploy upload') < stagingDeploy.indexOf('Copy source files to VPS'));
  });

  it('health gates Agonara workflow version checks on HTTP success before parsing JSON', () => {
    const stagingDeploy = jobSection('deploy-agonara-staging');
    const prodDeploy = jobSection('deploy-agonara-prod');
    const healthGate = 'node -e \'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); return response.json(); }).then(health => { if (health.status !== "ok" || health.version !== process.env.EXPECTED_VERSION) process.exit(1); }).catch(() => process.exit(1))\'';

    assert.ok(stagingDeploy.includes(`docker exec -e EXPECTED_VERSION="\${EXPECTED_VERSION}" agonara-staging ${healthGate}`));
    assert.ok(prodDeploy.includes(`docker exec -e EXPECTED_VERSION="\${EXPECTED_VERSION}" agonara ${healthGate}`));
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

  it('reports FolioTell jobs in failure notifications', () => {
    const notify = jobSection('notify');

    assert.ok(notify.includes('test-foliotell=${{ needs.test-foliotell.result }}'));
    assert.ok(notify.includes('deploy-foliotell-testflight=${{ needs.deploy-foliotell-testflight.result }}'));
  });

  it('cleans Agonara smoke artifacts when smoke execution fails', () => {
    const stagingDeploy = jobSection('deploy-agonara-staging');
    const prodDeploy = jobSection('deploy-agonara-prod');

    assert.ok(stagingDeploy.includes("trap 'rm -f /tmp/agonara-smoke.json' EXIT"));
    assert.ok(prodDeploy.includes("trap 'rm -f /tmp/agonara-smoke.json' EXIT"));
    assert.ok(!stagingDeploy.includes("&& rm -f /tmp/agonara-smoke.json"));
    assert.ok(!prodDeploy.includes("&& rm -f /tmp/agonara-smoke.json"));
  });

  it('cleans uploaded Agonara deploy source after failed staging or any prod outcome', () => {
    const stagingDeploy = jobSection('deploy-agonara-staging');
    const prodDeploy = jobSection('deploy-agonara-prod');

    assert.ok(stagingDeploy.includes('Clean deploy upload after staging failure'));
    assert.ok(stagingDeploy.includes('if: failure()'));
    assert.ok(prodDeploy.includes('Clean deploy upload'));
    assert.ok(prodDeploy.includes('if: always()'));
    assert.ok(prodDeploy.indexOf('Rollback production on failure') < prodDeploy.indexOf('Clean deploy upload'));
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
