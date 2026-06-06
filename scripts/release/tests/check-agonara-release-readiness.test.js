import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { stringify } from '../lib/toml.js';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test',
  GIT_CONFIG_NOSYSTEM: '1',
  HOME: '/dev/null',
};

let scratchDirs;

describe('check-agonara-release-readiness', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agonara-readiness-test-'));
    scratchDirs = [];
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    for (const scratchDir of scratchDirs) {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  it('passes when the first Agonara release tag is ready', () => {
    writeAgonaraReleaseRepo(tmp);

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('OK locked release install'));
    assert.ok(result.stdout.includes('OK deploy upload preflight'));
    assert.ok(result.stdout.includes('OK deploy health gate'));
    assert.ok(result.stdout.includes('OK rollback health gate'));
    assert.ok(result.stdout.includes('OK production backup'));
    assert.ok(result.stdout.includes('OK production restore'));
    assert.ok(result.stdout.includes('Agonara release readiness passed for agonara_v0.1.0.'));
  });

  it('fails when run away from trunk', () => {
    writeAgonaraReleaseRepo(tmp);
    git(tmp, 'checkout -b release-check');

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('releases are only allowed from trunk'));
  });

  it('fails when the release tag already exists', () => {
    writeAgonaraReleaseRepo(tmp);
    git(tmp, 'tag agonara_v0.1.0');

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release tag already exists: agonara_v0.1.0'));
  });

  it('fails when the working tree is dirty', () => {
    writeAgonaraReleaseRepo(tmp);
    writeFileSync(join(tmp, 'agonara/uncommitted.js'), 'uncommitted\n');

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('working tree must be clean'));
  });

  it('fails when the workflow does not require Agonara deploy success', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: [
        'jobs:',
        '  deploy-agonara-staging:',
        '  deploy-agonara-prod:',
        '      - name: Verify Agonara deploy secrets',
        '        run: true',
      ].join('\n'),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("release-unit.yml missing needs.deploy-agonara-staging.result == 'success'"));
  });

  it('fails when the locked release install wiring is incomplete', () => {
    writeAgonaraReleaseRepo(tmp, {
      dockerfile: [
        'FROM node:22',
        'COPY --chown=agonara:agonara package.json ./',
        'RUN npm install --omit=dev',
      ].join('\n'),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('Agonara Dockerfile must copy package-lock.json and use npm ci --omit=dev'));
  });

  it('fails when the release workflow does not upload the Agonara package lock', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        '        source: "agonara/package-lock.json"',
        '        source: "agonara/package.json"',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml must upload agonara/package-lock.json'));
  });

  it('fails when the release workflow does not clean the Agonara upload before copying source', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        '      - name: Prepare clean Agonara deploy upload\n        script: rm -rf /tmp/agonara-deploy\n',
        '',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml must clean /tmp/agonara-deploy before copying Agonara source'));
  });

  it('fails when upload cleanup is outside the Agonara staging deploy job', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        '      - name: Prepare clean Agonara deploy upload\n        script: rm -rf /tmp/agonara-deploy\n',
        '',
      ).replace(
        '  deploy-agonara-prod:',
        [
          '  cleanup-agonara-upload:',
          '      - name: Prepare clean Agonara deploy upload',
          '        script: rm -rf /tmp/agonara-deploy',
          '      - name: Copy source files to VPS',
          '  deploy-agonara-prod:',
        ].join('\n'),
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml must clean /tmp/agonara-deploy before copying Agonara source'));
  });

  it('fails when workflow version checks parse health JSON without HTTP success', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        workflowHealthGate('agonara'),
        'docker exec -e EXPECTED_VERSION="${EXPECTED_VERSION}" agonara node -e \'fetch("http://127.0.0.1:8080/operations/health").then(response => response.json()).then(health => { if (health.status !== "ok" || health.version !== process.env.EXPECTED_VERSION) process.exit(1); }).catch(() => process.exit(1))\'',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml must health-gate Agonara workflow version checks on HTTP success before parsing JSON'));
  });

  it('fails when workflow real evaluator smoke does not clean artifacts on failure', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        workflowSmokeGate('agonara'),
        workflowSmokeGate('agonara').replace("trap 'rm -f /tmp/agonara-smoke.json' EXIT; ", ''),
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml must run Agonara real evaluator smoke with cleanup and expected version checks'));
  });

  it('fails when workflow cleans upload before production rollback can run', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        workflowProdCleanupLifecycle(),
        [
          '      - name: Clean deploy upload',
          '        if: always()',
          '        script: rm -rf /tmp/agonara-deploy || true',
          '      - name: Rollback production on failure',
          '        if: failure()',
          '        script: bash /opt/agonara/scripts/rollback-prod.sh',
        ].join('\n'),
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml must cleanup staging failures and run production rollback before final upload cleanup'));
  });

  it('fails when workflow cleanup lifecycle tokens appear outside the cleanup steps', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        workflowStagingCleanup(),
        [
          '      - name: Clean deploy upload after staging failure',
          '        if: always()',
          '      - name: Unrelated staging failure step',
          '        if: failure()',
          '        script: rm -rf /tmp/agonara-deploy || true',
        ].join('\n'),
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml must cleanup staging failures and run production rollback before final upload cleanup'));
  });

  it('fails when workflow notifications do not trigger on Agonara deploy failures', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        "      || needs.deploy-agonara-prod.result == 'failure'",
        '',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml notify job must include Agonara deploy failures and report their results'));
  });

  it('fails when workflow notifications do not depend on Agonara deploy jobs', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        workflowNotifyFanIn(),
        workflowNotifyFanIn().replace('    needs: [deploy-agonara-staging, deploy-agonara-prod]', '    needs: [deploy-agonara-staging]'),
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml notify job must include Agonara deploy failures and report their results'));
  });

  it('fails when GitHub release does not depend on Agonara deploy jobs', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        workflowGithubReleaseFanIn(),
        workflowGithubReleaseFanIn().replace('    needs: [deploy-agonara-staging, deploy-agonara-prod]', '    needs: [deploy-agonara-staging]'),
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml github-release job must require successful Agonara deploys before release creation'));
  });

  it('fails when GitHub release does not require successful Agonara production deploy', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        "      && (needs.verify.outputs.basename != 'agonara' || needs.deploy-agonara-prod.result == 'success')",
        '',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml github-release job must require successful Agonara deploys before release creation'));
  });

  it('fails when production deploy does not depend on staging deploy', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        '    needs: [deploy-agonara-staging, verify]',
        '    needs: [verify]',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml Agonara deploy jobs must be scoped to Agonara tags and promote staging before production'));
  });

  it('fails when staging deploy is not scoped to Agonara tags', () => {
    writeAgonaraReleaseRepo(tmp, {
      workflow: validReleaseWorkflow().replace(
        "    if: ${{ needs.verify.outputs.basename == 'agonara' }}",
        '',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('release-unit.yml Agonara deploy jobs must be scoped to Agonara tags and promote staging before production'));
  });

  it('fails when the CI dispatcher does not route Agonara package lock changes', () => {
    writeAgonaraReleaseRepo(tmp, {
      ciWorkflow: validCiWorkflow().replace(
        '    - "agonara/package-lock.json"',
        '    - "agonara/package.json"',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('ci.yml must route agonara/package-lock.json changes to Agonara core'));
  });

  it('fails when deploy scripts can mutate the deploy root before upload preflight', () => {
    writeAgonaraReleaseRepo(tmp, {
      deployProd: [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'cd "${DEPLOY_ROOT}"',
        'cp "${UPLOAD_ROOT}/Dockerfile" .',
      ].join('\n'),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/deploy-prod.sh must preflight required upload files before cd "${DEPLOY_ROOT}"'));
  });

  it('fails when deploy scripts define but do not invoke the upload preflight before mutation', () => {
    writeAgonaraReleaseRepo(tmp, {
      deployProd: [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'require_upload_payload() {',
        '  require_upload_file "${UPLOAD_ROOT}/Dockerfile"',
        '  require_upload_file "${UPLOAD_ROOT}/package.json"',
        '  require_upload_file "${UPLOAD_ROOT}/package-lock.json"',
        '  require_upload_file "${UPLOAD_ROOT}/compose.prod.yml"',
        '  require_upload_directory "${UPLOAD_ROOT}/src"',
        '  require_upload_directory "${UPLOAD_ROOT}/scripts"',
        '}',
        'cd "${DEPLOY_ROOT}"',
      ].join('\n'),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/deploy-prod.sh must invoke require_upload_payload before cd "${DEPLOY_ROOT}"'));
  });

  it('fails when deploy scripts health gate by substring instead of structured JSON', () => {
    writeAgonaraReleaseRepo(tmp, {
      deployProd: validDeployScript('compose.prod.yml').replace(
        deployHealthGate(),
        'fetch("http://127.0.0.1:8080/operations/health").then(response => response.text()).then(body => { if (!body.includes(`"version":"${process.env.EXPECTED_VERSION}"`)) process.exit(1); })',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/deploy-prod.sh must health-gate HTTP success, status ok, and expected version from JSON'));
  });

  it('fails when deploy scripts only mention structured health gate tokens outside the gate', () => {
    writeAgonaraReleaseRepo(tmp, {
      deployProd: validDeployScript('compose.prod.yml').replace(
        deployHealthGate(),
        [
          '# operations/health',
          '# !response.ok',
          '# response.json()',
          '# health.status !== "ok"',
          '# health.version !== process.env.EXPECTED_VERSION',
        ].join('\n'),
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/deploy-prod.sh must health-gate HTTP success, status ok, and expected version from JSON'));
  });

  it('fails when rollback does not health-gate restored service availability', () => {
    writeAgonaraReleaseRepo(tmp, {
      rollbackProd: validRollbackScript().replace(rollbackHealthGate(), ''),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/rollback-prod.sh must restore the rollback image without rebuild and health-gate service availability'));
  });

  it('fails when rollback commands only appear in comments', () => {
    writeAgonaraReleaseRepo(tmp, {
      rollbackProd: validRollbackScript()
        .split('\n')
        .map(line => line.includes('docker ') || line.includes('"${COMPOSE[@]}"') ? `# ${line.trim()}` : line)
        .join('\n'),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/rollback-prod.sh must restore the rollback image without rebuild and health-gate service availability'));
  });

  it('fails when rollback rebuilds the restored image', () => {
    writeAgonaraReleaseRepo(tmp, {
      rollbackProd: validRollbackScript().replace(
        '"${COMPOSE[@]}" up -d --no-build --wait',
        '"${COMPOSE[@]}" up -d --build --wait',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/rollback-prod.sh must restore the rollback image without rebuild and health-gate service availability'));
  });

  it('fails when rollback depends on the failed deploy target version', () => {
    writeAgonaraReleaseRepo(tmp, {
      rollbackProd: `${validRollbackScript()}\nEXPECTED_VERSION=0.1.0`,
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/rollback-prod.sh must restore the rollback image without rebuild and health-gate service availability'));
  });

  it('fails when production backup does not copy the archive off-host', () => {
    writeAgonaraReleaseRepo(tmp, {
      backupProd: validBackupScript().replace(
        '"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"',
        '',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/backup-prod.sh must create a non-empty production data archive, recover service, copy off-host, and prune local retention'));
  });

  it('fails when production backup does not initialize its off-host destination', () => {
    writeAgonaraReleaseRepo(tmp, {
      backupProd: validBackupScript().replace('BACKUP_REMOTE="${AGONARA_BACKUP_REMOTE:-}"\n', ''),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/backup-prod.sh must create a non-empty production data archive, recover service, copy off-host, and prune local retention'));
  });

  it('fails when production backup cannot recover service after archive failure', () => {
    writeAgonaraReleaseRepo(tmp, {
      backupProd: validBackupScript().replace('trap restart_prod EXIT\n', ''),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/backup-prod.sh must create a non-empty production data archive, recover service, copy off-host, and prune local retention'));
  });

  it('fails when production backup accepts an empty archive', () => {
    writeAgonaraReleaseRepo(tmp, {
      backupProd: validBackupScript().replace('test -s "${BACKUP_DIR}/${BACKUP_FILE}"\n', ''),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/backup-prod.sh must create a non-empty production data archive, recover service, copy off-host, and prune local retention'));
  });

  it('fails when production backup does not verify the archived database', () => {
    writeAgonaraReleaseRepo(tmp, {
      backupProd: validBackupScript().replace(`${backupArchiveValidation()}\n`, ''),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/backup-prod.sh must create a non-empty production data archive, recover service, copy off-host, and prune local retention'));
  });

  it('fails when production backup verifies the archive after off-host transfer', () => {
    const offHostTransfer = '"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"';
    writeAgonaraReleaseRepo(tmp, {
      backupProd: validBackupScript()
        .replace(`${backupArchiveValidation()}\n`, '')
        .replace(offHostTransfer, `${offHostTransfer}\n${backupArchiveValidation()}`),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/backup-prod.sh must create a non-empty production data archive, recover service, copy off-host, and prune local retention'));
  });

  it('fails when production backup does not prune local retention', () => {
    writeAgonaraReleaseRepo(tmp, {
      backupProd: validBackupScript().replace(
        'find "${BACKUP_DIR}" -type f -name "agonara-data-*.tar.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete\n',
        '',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/backup-prod.sh must create a non-empty production data archive, recover service, copy off-host, and prune local retention'));
  });

  it('fails when production restore does not validate the archive before mutation', () => {
    writeAgonaraReleaseRepo(tmp, {
      restoreProd: validRestoreScript().replace(
        'docker run --rm -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c \'tar -tzf "/restore/$1" | grep -Fx "./agonara.sqlite"\' sh "${BACKUP_BASENAME}" >/dev/null\n',
        '',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/restore-prod.sh must validate the backup before replacing production data, restart without rebuild, and health-gate availability'));
  });

  it('fails when production restore rebuilds the deployed image', () => {
    writeAgonaraReleaseRepo(tmp, {
      restoreProd: validRestoreScript().replace(
        '"${COMPOSE[@]}" up -d --no-build --wait',
        '"${COMPOSE[@]}" up -d --build --wait',
      ),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/restore-prod.sh must validate the backup before replacing production data, restart without rebuild, and health-gate availability'));
  });

  it('fails when production restore does not health-gate availability', () => {
    writeAgonaraReleaseRepo(tmp, {
      restoreProd: validRestoreScript().replace(`${rollbackHealthGate()}\n`, ''),
    });

    const result = runReadiness(tmp);

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('agonara/scripts/restore-prod.sh must validate the backup before replacing production data, restart without rebuild, and health-gate availability'));
  });

  it('passes the GitHub secret check when required deploy secret names exist', () => {
    writeAgonaraReleaseRepo(tmp);
    const fakeGhBin = writeFakeGhSecretList([
      'AGONARA_VPS_HOST',
      'AGONARA_VPS_USER',
      'AGONARA_VPS_SSH_KEY',
    ]);

    const result = runReadiness(tmp, {
      args: ['--check-github-secrets'],
      env: { PATH: `${fakeGhBin}:${process.env.PATH}` },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.ok(result.stdout.includes('OK github deploy secret names'));
  });

  it('fails the GitHub secret check when a required deploy secret name is missing', () => {
    writeAgonaraReleaseRepo(tmp);
    const fakeGhBin = writeFakeGhSecretList([
      'AGONARA_VPS_HOST',
      'AGONARA_VPS_USER',
    ]);

    const result = runReadiness(tmp, {
      args: ['--check-github-secrets'],
      env: { PATH: `${fakeGhBin}:${process.env.PATH}` },
    });

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('missing GitHub deploy secret names: AGONARA_VPS_SSH_KEY'));
  });

  it('fails the GitHub secret check when gh cannot list secrets', () => {
    writeAgonaraReleaseRepo(tmp);
    const fakeGhBin = writeFakeGhError();

    const result = runReadiness(tmp, {
      args: ['--check-github-secrets'],
      env: { PATH: `${fakeGhBin}:${process.env.PATH}` },
    });

    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('unable to list GitHub secret names with gh: gh auth failed'));
  });
});

function writeAgonaraReleaseRepo(dir, {
  dockerfile = validDockerfile(),
  workflow = validReleaseWorkflow(),
  ciWorkflow = validCiWorkflow(),
  deployStaging = validDeployScript('compose.staging.yml'),
  deployProd = validDeployScript('compose.prod.yml'),
  rollbackProd = validRollbackScript(),
  backupProd = validBackupScript(),
  restoreProd = validRestoreScript(),
} = {}) {
  git(dir, 'init -b trunk');
  git(dir, 'config commit.gpgSign false');
  git(dir, 'commit --allow-empty -m "initial"');
  mkdirSync(join(dir, 'agonara'), { recursive: true });
  writeFileSync(join(dir, 'agonara/package.json'), JSON.stringify({ name: 'agonara', version: '0.1.0' }));
  writeFileSync(join(dir, 'agonara/package-lock.json'), JSON.stringify({
    name: 'agonara',
    version: '0.1.0',
    lockfileVersion: 3,
    packages: { '': { name: 'agonara', version: '0.1.0' } },
  }));
  writeFileSync(join(dir, 'agonara/Dockerfile'), dockerfile);
  mkdirSync(join(dir, 'agonara/scripts'), { recursive: true });
  writeFileSync(join(dir, 'agonara/scripts/deploy-staging.sh'), deployStaging);
  writeFileSync(join(dir, 'agonara/scripts/deploy-prod.sh'), deployProd);
  writeFileSync(join(dir, 'agonara/scripts/rollback-prod.sh'), rollbackProd);
  writeFileSync(join(dir, 'agonara/scripts/backup-prod.sh'), backupProd);
  writeFileSync(join(dir, 'agonara/scripts/restore-prod.sh'), restoreProd);
  writeFileSync(join(dir, 'release-units.config.toml'), 'paths = ["agonara"]\n');
  writeFileSync(
    join(dir, 'release-units.toml'),
    stringify({
      units: [{ basename: 'agonara', path: 'agonara', metadata: 'package.json', version: '0.1.0', docker: true }],
    }),
  );
  mkdirSync(join(dir, '.github/workflows'), { recursive: true });
  writeFileSync(join(dir, '.github/workflows/release-unit.yml'), workflow);
  writeFileSync(join(dir, '.github/workflows/ci.yml'), ciWorkflow);
  git(dir, 'add -A');
  git(dir, 'commit -m "add agonara release wiring"');
}

function validDockerfile() {
  return [
    'FROM node:22',
    'COPY --chown=agonara:agonara package.json package-lock.json ./',
    'RUN npm ci --omit=dev',
  ].join('\n');
}

function validDeployScript(composeFile) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'require_upload_file "${UPLOAD_ROOT}/Dockerfile"',
    'require_upload_file "${UPLOAD_ROOT}/package.json"',
    'require_upload_file "${UPLOAD_ROOT}/package-lock.json"',
    `require_upload_file "\${UPLOAD_ROOT}/${composeFile}"`,
    'require_upload_directory "${UPLOAD_ROOT}/src"',
    'require_upload_directory "${UPLOAD_ROOT}/scripts"',
    '',
    'require_upload_payload',
    'cd "${DEPLOY_ROOT}"',
    deployHealthGate(),
  ].join('\n');
}

function deployHealthGate() {
  return 'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); return response.json(); }).then(health => { if (health.status !== "ok" || health.version !== process.env.EXPECTED_VERSION) process.exit(1); })';
}

function validRollbackScript() {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'if docker image inspect agonara:rollback >/dev/null 2>&1; then',
    '  docker tag agonara:rollback agonara:latest',
    '  "${COMPOSE[@]}" down',
    '  "${COMPOSE[@]}" up -d --no-build --wait',
    `  ${rollbackHealthGate()}`,
    'fi',
  ].join('\n');
}

function rollbackHealthGate() {
  return 'docker exec agonara node -e \'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))\'';
}

function validBackupScript() {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"',
    'BACKUP_DIR="${AGONARA_BACKUP_DIR:-${DEPLOY_ROOT}/backups}"',
    'BACKUP_REMOTE="${AGONARA_BACKUP_REMOTE:-}"',
    'BACKUP_SSH_KEY="${AGONARA_BACKUP_SSH_KEY:-}"',
    'BACKUP_RETENTION_DAYS="${AGONARA_BACKUP_RETENTION_DAYS:-14}"',
    'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-prod_agonara-data}"',
    'TIMESTAMP="${AGONARA_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"',
    'BACKUP_FILE="agonara-data-${TIMESTAMP}.tar.gz"',
    'COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)',
    'if [[ -z "${BACKUP_REMOTE}" ]]; then',
    '  echo "AGONARA_BACKUP_REMOTE is required for off-host backup storage" >&2',
    '  exit 1',
    'fi',
    'cd "${DEPLOY_ROOT}"',
    'mkdir -p "${BACKUP_DIR}"',
    'RSYNC=(rsync -a)',
    'if [[ -n "${BACKUP_SSH_KEY}" ]]; then',
    '  RSYNC+=( -e "ssh -i ${BACKUP_SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" )',
    'fi',
    'restart_prod() {',
    '  "${COMPOSE[@]}" start agonara >/dev/null 2>&1 || true',
    '}',
    'trap restart_prod EXIT',
    '"${COMPOSE[@]}" stop agonara',
    'docker run --rm -v "${DATA_VOLUME}:/data:ro" -v "${BACKUP_DIR}:/backup" alpine:3.20 tar -czf "/backup/${BACKUP_FILE}" -C /data .',
    'test -s "${BACKUP_DIR}/${BACKUP_FILE}"',
    backupArchiveValidation(),
    '"${COMPOSE[@]}" start agonara',
    'trap - EXIT',
    '"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"',
    'find "${BACKUP_DIR}" -type f -name "agonara-data-*.tar.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete',
    'echo "Production backup successful: ${BACKUP_FILE}"',
  ].join('\n');
}

function backupArchiveValidation() {
  return 'docker run --rm -v "${BACKUP_DIR}:/backup:ro" alpine:3.20 sh -c \'tar -tzf "/backup/$1" | grep -Fx "./agonara.sqlite"\' sh "${BACKUP_FILE}" >/dev/null';
}

function validRestoreScript() {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"',
    'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-prod_agonara-data}"',
    'BACKUP_FILE="${1:-}"',
    'COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)',
    'if [[ -z "${BACKUP_FILE}" ]]; then',
    '  echo "backup file path is required" >&2',
    '  exit 1',
    'fi',
    'if [[ ! -f "${BACKUP_FILE}" ]]; then',
    '  echo "backup file not found: ${BACKUP_FILE}" >&2',
    '  exit 1',
    'fi',
    'test -s "${BACKUP_FILE}"',
    'BACKUP_BASENAME="$(basename "${BACKUP_FILE}")"',
    'docker run --rm -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c \'tar -tzf "/restore/$1" | grep -Fx "./agonara.sqlite"\' sh "${BACKUP_BASENAME}" >/dev/null',
    'cd "${DEPLOY_ROOT}"',
    '"${COMPOSE[@]}" down',
    'docker run --rm -v "${DATA_VOLUME}:/data" -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c \'find /data -mindepth 1 -exec rm -rf {} + && tar -xzf "/restore/$1" -C /data\' sh "${BACKUP_BASENAME}"',
    '"${COMPOSE[@]}" up -d --no-build --wait',
    rollbackHealthGate(),
    'echo "Production restore successful"',
  ].join('\n');
}

function validReleaseWorkflow() {
  return [
    'jobs:',
    '  deploy-agonara-staging:',
    "    if: ${{ needs.verify.outputs.basename == 'agonara' }}",
    '    needs: [core, verify]',
    '      - name: Verify Agonara deploy secrets',
    '        run: true',
    '      - name: Prepare clean Agonara deploy upload',
    '        script: rm -rf /tmp/agonara-deploy',
    '      - name: Copy source files to VPS',
    '        source: "agonara/package-lock.json"',
    workflowHealthGate('agonara-staging'),
    workflowSmokeGate('agonara-staging'),
    workflowStagingCleanup(),
    '  deploy-agonara-prod:',
    "    if: ${{ needs.verify.outputs.basename == 'agonara' }}",
    '    needs: [deploy-agonara-staging, verify]',
    "      && needs.deploy-agonara-staging.result == 'success'",
    "      && needs.deploy-agonara-prod.result == 'success'",
    '        deploy-agonara-staging=${{ needs.deploy-agonara-staging.result }}',
    '        deploy-agonara-prod=${{ needs.deploy-agonara-prod.result }}',
    workflowHealthGate('agonara'),
    workflowSmokeGate('agonara'),
    workflowProdCleanupLifecycle(),
    workflowGithubReleaseFanIn(),
    workflowNotifyFanIn(),
  ].join('\n');
}

function workflowGithubReleaseFanIn() {
  return [
    '  github-release:',
    '    needs: [deploy-agonara-staging, deploy-agonara-prod]',
    "      && (needs.verify.outputs.basename != 'agonara' || needs.deploy-agonara-staging.result == 'success')",
    "      && (needs.verify.outputs.basename != 'agonara' || needs.deploy-agonara-prod.result == 'success')",
  ].join('\n');
}

function workflowNotifyFanIn() {
  return [
    '  notify:',
    '    needs: [deploy-agonara-staging, deploy-agonara-prod]',
    "      || needs.deploy-agonara-staging.result == 'failure'",
    "      || needs.deploy-agonara-prod.result == 'failure'",
    '        deploy-agonara-staging=${{ needs.deploy-agonara-staging.result }}',
    '        deploy-agonara-prod=${{ needs.deploy-agonara-prod.result }}',
  ].join('\n');
}

function workflowHealthGate(containerName) {
  return `docker exec -e EXPECTED_VERSION="\${EXPECTED_VERSION}" ${containerName} node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); return response.json(); }).then(health => { if (health.status !== "ok" || health.version !== process.env.EXPECTED_VERSION) process.exit(1); }).catch(() => process.exit(1))'`;
}

function workflowSmokeGate(containerName) {
  return `docker exec -e AGONARA_SMOKE_BASE_URL=http://127.0.0.1:8080 -e EXPECTED_VERSION="\${EXPECTED_VERSION}" ${containerName} sh -lc "trap 'rm -f /tmp/agonara-smoke.json' EXIT; node scripts/smoke-open-answer-evaluator.mjs > /tmp/agonara-smoke.json && node -e 'const fs = require(\\"node:fs\\"); const result = JSON.parse(fs.readFileSync(\\"/tmp/agonara-smoke.json\\", \\"utf8\\")); if (!result.evaluationId || result.healthVersion !== process.env.EXPECTED_VERSION) process.exit(1);'"`;
}

function workflowStagingCleanup() {
  return [
    '      - name: Clean deploy upload after staging failure',
    '        if: failure()',
    '        script: rm -rf /tmp/agonara-deploy || true',
  ].join('\n');
}

function workflowProdCleanupLifecycle() {
  return [
    '      - name: Rollback production on failure',
    '        if: failure()',
    '        script: bash /opt/agonara/scripts/rollback-prod.sh',
    '      - name: Clean deploy upload',
    '        if: always()',
    '        script: rm -rf /tmp/agonara-deploy || true',
  ].join('\n');
}

function validCiWorkflow() {
  return [
    'filters:',
    '  agonara:',
    '    - "agonara/package-lock.json"',
    '  agonara-ci:',
    '    - ".github/workflows/agonara-core.yml"',
  ].join('\n');
}

function runReadiness(dir, {
  args = [],
  env = {},
} = {}) {
  const script = join(import.meta.dirname, '..', 'check-agonara-release-readiness.js');
  try {
    const stdout = execFileSync(process.execPath, [script, '--root', dir, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

function writeFakeGhSecretList(secretNames) {
  const fakeGhBin = mkdtempSync(join(tmpdir(), 'agonara-gh-bin-'));
  scratchDirs.push(fakeGhBin);
  const payload = JSON.stringify(secretNames.map($0 => ({ name: $0 })));
  writeFileSync(join(fakeGhBin, 'gh'), [
    '#!/bin/sh',
    `printf '%s\\n' '${payload}'`,
  ].join('\n'));
  chmodSync(join(fakeGhBin, 'gh'), 0o755);
  return fakeGhBin;
}

function writeFakeGhError() {
  const fakeGhBin = mkdtempSync(join(tmpdir(), 'agonara-gh-bin-'));
  scratchDirs.push(fakeGhBin);
  writeFileSync(join(fakeGhBin, 'gh'), [
    '#!/bin/sh',
    "printf '%s\\n' 'gh auth failed' >&2",
    'exit 7',
  ].join('\n'));
  chmodSync(join(fakeGhBin, 'gh'), 0o755);
  return fakeGhBin;
}

function git(dir, cmd) {
  return execSync(`git ${cmd}`, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
