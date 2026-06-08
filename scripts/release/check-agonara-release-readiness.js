#!/usr/bin/env node

/**
 * Verify the repo is ready for the first Agonara release tag.
 *
 * Usage:
 *   node scripts/release/check-agonara-release-readiness.js
 *   node scripts/release/check-agonara-release-readiness.js --tag agonara_v0.1.0
 *   node scripts/release/check-agonara-release-readiness.js --root <dir>
 *   node scripts/release/check-agonara-release-readiness.js --check-github-secrets
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { discoverUnits, loadConfig, loadManifest } from './lib/manifest.js';

const rootIdx = process.argv.indexOf('--root');
const repoRoot = rootIdx !== -1
  ? resolve(process.argv[rootIdx + 1])
  : resolve(import.meta.dirname, '..', '..');
const tagIdx = process.argv.indexOf('--tag');
const releaseTag = tagIdx !== -1 ? process.argv[tagIdx + 1] : 'agonara_v0.1.0';
const checkGithubSecrets = process.argv.includes('--check-github-secrets');
const requiredGithubDeploySecretNames = [
  'AGONARA_VPS_HOST',
  'AGONARA_VPS_USER',
  'AGONARA_VPS_SSH_KEY',
];

const checks = [];

try {
  runReadinessChecks();
  for (const check of checks) {
    process.stdout.write(`OK ${check}\n`);
  }
  process.stdout.write(`Agonara release readiness passed for ${releaseTag}.\n`);
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exit(1);
}

function runReadinessChecks() {
  const { basename, version } = parseReleaseTag(releaseTag);
  if (basename !== 'agonara') {
    throw new Error(`expected agonara release tag, got ${releaseTag}`);
  }
  checks.push('tag format');

  const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (currentBranch !== 'trunk') {
    throw new Error(`releases are only allowed from trunk (current branch: ${currentBranch})`);
  }
  checks.push('trunk branch');

  if (tagExists(releaseTag)) {
    throw new Error(`release tag already exists: ${releaseTag}`);
  }
  checks.push('release tag absent');

  const workingTreeStatus = git(['status', '--short']);
  if (workingTreeStatus !== '') {
    throw new Error('working tree must be clean before pushing the Agonara release tag');
  }
  checks.push('clean worktree');

  const manifestUnit = loadManifest(repoRoot).units.find($0 => $0.basename === 'agonara');
  if (!manifestUnit) {
    throw new Error('agonara missing from release-units.toml');
  }
  if (manifestUnit.version !== version) {
    throw new Error(`manifest version ${manifestUnit.version} does not match tag version ${version}`);
  }
  if (manifestUnit.path !== 'agonara' || manifestUnit.metadata !== 'package.json' || manifestUnit.docker !== true) {
    throw new Error('agonara manifest entry must be path=agonara, metadata=package.json, docker=true');
  }
  checks.push('manifest entry');

  const packageVersion = JSON.parse(readFileSync(join(repoRoot, 'agonara/package.json'), 'utf8')).version;
  if (packageVersion !== version) {
    throw new Error(`agonara/package.json version ${packageVersion} does not match tag version ${version}`);
  }
  checks.push('package version');

  const discoveredUnit = discoverUnits(repoRoot, loadConfig(repoRoot).paths)
    .find($0 => $0.basename === 'agonara');
  if (!discoveredUnit) {
    throw new Error('agonara missing from release-units.config.toml discovery');
  }
  if (JSON.stringify(discoveredUnit) !== JSON.stringify(manifestUnit)) {
    throw new Error('release-units.toml is out of sync for agonara');
  }
  checks.push('manifest sync');

  const workflowPath = join(repoRoot, '.github/workflows/release-unit.yml');
  if (!existsSync(workflowPath)) {
    throw new Error('release-unit.yml is missing');
  }
  const workflow = readFileSync(workflowPath, 'utf8');
  assertWorkflowContains(workflow, 'deploy-agonara-staging:');
  assertWorkflowContains(workflow, 'deploy-agonara-prod:');
  assertWorkflowContains(workflow, 'Verify Agonara deploy secrets');
  assertWorkflowContains(workflow, "needs.deploy-agonara-staging.result == 'success'");
  assertWorkflowContains(workflow, "needs.deploy-agonara-prod.result == 'success'");
  assertWorkflowContains(workflow, 'deploy-agonara-staging=${{ needs.deploy-agonara-staging.result }}');
  assertWorkflowContains(workflow, 'deploy-agonara-prod=${{ needs.deploy-agonara-prod.result }}');
  const stagingJob = getWorkflowJob(workflow, 'deploy-agonara-staging');
  const prodJob = getWorkflowJob(workflow, 'deploy-agonara-prod');
  checkWorkflowDeployJobGates(stagingJob, prodJob);
  if (!appearsInOrder(stagingJob, [
    'Prepare clean Agonara deploy upload',
    'rm -rf /tmp/agonara-deploy',
    'Copy source files to VPS',
  ])) {
    throw new Error('release-unit.yml must clean /tmp/agonara-deploy before copying Agonara source');
  }
  checkWorkflowHealthGate(stagingJob, 'agonara-staging');
  checkWorkflowHealthGate(prodJob, 'agonara');
  checkWorkflowSmokeGate(stagingJob, 'agonara-staging');
  checkWorkflowSmokeGate(prodJob, 'agonara');
  checkWorkflowPublicProdSmokeGate(prodJob);
  checkWorkflowCleanupLifecycle(stagingJob, prodJob);
  checkWorkflowGithubReleaseFanIn(workflow);
  checkWorkflowNotifyFanIn(workflow);
  checks.push('release workflow');

  checkLockedReleaseInstall(version, workflow);
  checkContainerRuntimeBoundary();
  checks.push('container runtime boundary');
  checkDeployUploadPreflight('agonara/scripts/deploy-staging.sh', 'compose.staging.yml');
  checkDeployUploadPreflight('agonara/scripts/deploy-prod.sh', 'compose.prod.yml');
  checks.push('deploy upload preflight');
  checkDeployHealthGate('agonara/scripts/deploy-staging.sh');
  checkDeployHealthGate('agonara/scripts/deploy-prod.sh');
  checks.push('deploy health gate');
  checkDeployImageLifecycle();
  checks.push('deploy image lifecycle');
  checkDeployTierIsolation();
  checks.push('deploy tier isolation');
  checkRollbackHealthGate();
  checks.push('rollback health gate');
  checkProductionBackup();
  checks.push('production backup');
  checkProductionRestore();
  checks.push('production restore');
  checkStagingBackupAndRestore();
  checks.push('staging backup and restore');

  if (checkGithubSecrets) {
    checkGithubDeploySecretNames();
  }
}

function parseReleaseTag(tag) {
  const separatorIndex = tag.lastIndexOf('_v');
  if (separatorIndex === -1) {
    throw new Error(`invalid tag format (expected <basename>_v<version>): ${tag}`);
  }
  const basename = tag.slice(0, separatorIndex);
  const version = tag.slice(separatorIndex + 2);
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version)) {
    throw new Error(`invalid semver in tag: ${tag}`);
  }
  return { basename, version };
}

function tagExists(tag) {
  try {
    git(['rev-parse', '--verify', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function assertWorkflowContains(workflow, expected) {
  if (!workflow.includes(expected)) {
    throw new Error(`release-unit.yml missing ${expected}`);
  }
}

function checkLockedReleaseInstall(version, workflow) {
  const lockfilePath = join(repoRoot, 'agonara/package-lock.json');
  if (!existsSync(lockfilePath)) {
    throw new Error('agonara/package-lock.json is missing');
  }
  const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  const lockfileVersion = lockfile.packages?.['']?.version ?? lockfile.version;
  if (lockfileVersion !== version) {
    throw new Error(`agonara/package-lock.json version ${lockfileVersion} does not match tag version ${version}`);
  }

  const dockerfile = readFileSync(join(repoRoot, 'agonara/Dockerfile'), 'utf8');
  if (
    !dockerfile.includes('COPY --chown=agonara:agonara package.json package-lock.json ./')
    || !dockerfile.includes('RUN npm ci --omit=dev')
  ) {
    throw new Error('Agonara Dockerfile must copy package-lock.json and use npm ci --omit=dev');
  }
  if (!workflow.includes('agonara/package-lock.json')) {
    throw new Error('release-unit.yml must upload agonara/package-lock.json');
  }

  const ciWorkflowPath = join(repoRoot, '.github/workflows/ci.yml');
  if (!existsSync(ciWorkflowPath)) {
    throw new Error('ci.yml is missing');
  }
  const ciWorkflow = readFileSync(ciWorkflowPath, 'utf8');
  if (!ciWorkflow.includes('"agonara/package-lock.json"')) {
    throw new Error('ci.yml must route agonara/package-lock.json changes to Agonara core');
  }
  checks.push('locked release install');
}

function checkContainerRuntimeBoundary() {
  const dockerfile = readFileSync(join(repoRoot, 'agonara/Dockerfile'), 'utf8');
  const lines = shellExecutableLines(dockerfile);
  const requiredSequence = [
    'FROM node:22-bookworm-slim',
    'RUN groupadd --system agonara && useradd --system --gid agonara --home-dir /app agonara',
    'WORKDIR /app',
    'COPY --chown=agonara:agonara package.json package-lock.json ./',
    'RUN npm ci --omit=dev',
    'COPY --chown=agonara:agonara src/ src/',
    'COPY --chown=agonara:agonara scripts/ scripts/',
    'RUN chown -R agonara:agonara /app && mkdir -p /data && chown agonara:agonara /data',
    'USER agonara',
    'ENV AGONARA_DB_PATH=/data/agonara.sqlite',
    'ENV HOST=0.0.0.0',
    'ENV PORT=8080',
    'EXPOSE 8080',
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\',
    'CMD node -e \'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))\'',
    'CMD ["node", "src/server.js"]',
  ];
  const stages = lines.filter($0 => $0.startsWith('FROM '));
  const healthchecks = lines.filter($0 => $0.startsWith('HEALTHCHECK '));
  const users = lines.filter($0 => $0.startsWith('USER '));
  if (
    !linesAppearInOrder(lines, requiredSequence)
    || stages.length !== 1
    || healthchecks.length !== 1
    || users.at(-1) !== 'USER agonara'
    || lines.at(-1) !== 'CMD ["node", "src/server.js"]'
  ) {
    throw new Error('Agonara Dockerfile must run as agonara with owned app/data files and a Node-native healthcheck');
  }
}

function checkDeployUploadPreflight(scriptPath, composeFile) {
  const fullPath = join(repoRoot, scriptPath);
  if (!existsSync(fullPath)) {
    throw new Error(`${scriptPath} is missing`);
  }
  const script = readFileSync(fullPath, 'utf8');
  const requiredNeedles = [
    'require_upload_file "${UPLOAD_ROOT}/Dockerfile"',
    'require_upload_file "${UPLOAD_ROOT}/package.json"',
    'require_upload_file "${UPLOAD_ROOT}/package-lock.json"',
    `require_upload_file "\${UPLOAD_ROOT}/${composeFile}"`,
    'require_upload_directory "${UPLOAD_ROOT}/src"',
    'require_upload_directory "${UPLOAD_ROOT}/scripts"',
  ];
  if (!appearsInOrder(script, requiredNeedles)) {
    throw new Error(`${scriptPath} must preflight required upload files before cd "\${DEPLOY_ROOT}"`);
  }
  if (!/(^|\n)require_upload_payload\n\n?cd "\$\{DEPLOY_ROOT\}"/.test(script)) {
    throw new Error(`${scriptPath} must invoke require_upload_payload before cd "\${DEPLOY_ROOT}"`);
  }
}

function checkDeployHealthGate(scriptPath) {
  const fullPath = join(repoRoot, scriptPath);
  if (!existsSync(fullPath)) {
    throw new Error(`${scriptPath} is missing`);
  }
  const script = readFileSync(fullPath, 'utf8');
  const healthGatePattern = /fetch\("http:\/\/127\.0\.0\.1:8080\/operations\/health"\)\.then\(response => \{ if \(!response\.ok\) process\.exit\(1\); return response\.json\(\); \}\)\.then\(health => \{ if \(health\.status !== "ok" \|\| health\.version !== process\.env\.EXPECTED_VERSION\) process\.exit\(1\); \}\)/;
  if (!healthGatePattern.test(script)) {
    throw new Error(`${scriptPath} must health-gate HTTP success, status ok, and expected version from JSON`);
  }
}

function checkDeployImageLifecycle() {
  const stagingPath = 'agonara/scripts/deploy-staging.sh';
  const prodPath = 'agonara/scripts/deploy-prod.sh';
  const stagingLines = shellExecutableLines(readFileSync(join(repoRoot, stagingPath), 'utf8'));
  const prodLines = shellExecutableLines(readFileSync(join(repoRoot, prodPath), 'utf8'));
  const stagingSequence = [
    'DEPLOY_VERSION="$(read_package_version package.json)"',
    'if [[ -z "${DEPLOY_VERSION}" ]]; then',
    '"${COMPOSE[@]}" build',
    'docker tag agonara:staging "agonara:${DEPLOY_VERSION}"',
    'docker tag agonara:staging "agonara:${DEPLOY_GIT_SHA}"',
    '"${COMPOSE[@]}" down',
    '"${COMPOSE[@]}" up -d --no-build --wait',
    deployHealthGateLine('agonara-staging'),
    'echo "Staging deploy successful"',
  ];
  const prodSequence = [
    'DEPLOY_VERSION="$(read_package_version package.json)"',
    'if [[ -z "${DEPLOY_VERSION}" ]]; then',
    'docker tag agonara:latest agonara:rollback || true',
    '"${COMPOSE[@]}" build',
    'docker tag agonara:latest "agonara:${DEPLOY_VERSION}"',
    'docker tag agonara:latest "agonara:${DEPLOY_GIT_SHA}"',
    '"${COMPOSE[@]}" down',
    '"${COMPOSE[@]}" up -d --no-build --wait',
    deployHealthGateLine('agonara'),
    'echo "Production deploy successful"',
  ];
  if (!linesAppearInOrder(stagingLines, stagingSequence) || !linesAppearInOrder(prodLines, prodSequence)) {
    throw new Error('Agonara deploy scripts must build before downtime, tag version and git sha, and retain the prior production image');
  }
}

function deployHealthGateLine(containerName) {
  return `docker exec -e EXPECTED_VERSION="\${DEPLOY_VERSION}" ${containerName} node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); return response.json(); }).then(health => { if (health.status !== "ok" || health.version !== process.env.EXPECTED_VERSION) process.exit(1); }).catch(() => process.exit(1))'`;
}

function checkDeployTierIsolation() {
  const stagingCompose = readFileSync(join(repoRoot, 'agonara/compose.staging.yml'), 'utf8');
  const prodCompose = readFileSync(join(repoRoot, 'agonara/compose.prod.yml'), 'utf8');
  const stagingLines = activeYamlLines(stagingCompose);
  const prodLines = activeYamlLines(prodCompose);
  const sharedRuntimeConfiguration = [
    'AGONARA_DB_PATH: /data/agonara.sqlite',
    'AGONARA_BOOTSTRAP_SECRET: ${AGONARA_BOOTSTRAP_SECRET:?Set AGONARA_BOOTSTRAP_SECRET}',
    'AGONARA_NOMOS_API_KEY: ${AGONARA_NOMOS_API_KEY:-}',
    'AGONARA_NOMOS_BASE_URL: ${AGONARA_NOMOS_BASE_URL:-}',
    'AGONARA_NOMOS_MODEL: ${AGONARA_NOMOS_MODEL:-}',
    'AGONARA_OPEN_ANSWER_EVALUATOR_TRIGGER_TOKEN: ${AGONARA_OPEN_ANSWER_EVALUATOR_TRIGGER_TOKEN:-}',
  ];
  const stagingRequirements = [
    'name: agonara-staging',
    'image: agonara:staging',
    'container_name: agonara-staging',
    'env_file: .env.staging',
    '- "127.0.0.1:18081:8080"',
    '- agonara-staging-data:/data',
    'agonara-staging-data:',
    ...sharedRuntimeConfiguration,
  ];
  const prodRequirements = [
    'name: agonara-prod',
    'image: agonara:latest',
    'container_name: agonara',
    'env_file: .env.prod',
    '- "127.0.0.1:18080:8080"',
    '- agonara-data:/data',
    'agonara-data:',
    ...sharedRuntimeConfiguration,
  ];
  const valid = stagingRequirements.every($0 => stagingLines.includes($0))
    && prodRequirements.every($0 => prodLines.includes($0))
    && JSON.stringify(yamlListItems(stagingCompose, 'ports')) === JSON.stringify(['- "127.0.0.1:18081:8080"'])
    && JSON.stringify(yamlListItems(prodCompose, 'ports')) === JSON.stringify(['- "127.0.0.1:18080:8080"']);
  if (!valid) {
    throw new Error('Agonara staging and production compose files must isolate container names, loopback ports, env files, and data volumes');
  }
}

function activeYamlLines(compose) {
  return compose.split('\n')
    .map($0 => $0.trim())
    .filter($0 => $0 !== '' && !$0.startsWith('#'));
}

function yamlListItems(compose, key) {
  const items = [];
  let keyIndent;
  for (const line of compose.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (keyIndent === undefined) {
      if (trimmed === `${key}:`) {
        keyIndent = indent;
      }
      continue;
    }
    if (indent <= keyIndent) {
      break;
    }
    if (trimmed.startsWith('- ')) {
      items.push(trimmed);
    }
  }
  return items;
}

function checkRollbackHealthGate() {
  const scriptPath = 'agonara/scripts/rollback-prod.sh';
  const fullPath = join(repoRoot, scriptPath);
  if (!existsSync(fullPath)) {
    throw new Error(`${scriptPath} is missing`);
  }
  const script = readFileSync(fullPath, 'utf8');
  const executableLines = shellExecutableLines(script);
  const requiredSequence = [
    'if docker image inspect agonara:rollback >/dev/null 2>&1; then',
    'docker tag agonara:rollback agonara:latest',
    '"${COMPOSE[@]}" down',
    '"${COMPOSE[@]}" up -d --no-build --wait',
    'docker exec agonara node -e \'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))\'',
  ];
  if (!linesAppearInOrder(executableLines, requiredSequence) || script.includes('EXPECTED_VERSION')) {
    throw new Error(`${scriptPath} must restore the rollback image without rebuild and health-gate service availability`);
  }
}

function checkProductionBackup() {
  const scriptPath = 'agonara/scripts/backup-prod.sh';
  const fullPath = join(repoRoot, scriptPath);
  if (!existsSync(fullPath)) {
    throw new Error(`${scriptPath} is missing`);
  }
  const executableLines = shellExecutableLines(readFileSync(fullPath, 'utf8'));
  const requiredSequence = [
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
    'echo "AGONARA_BACKUP_REMOTE is required for off-host backup storage" >&2',
    'exit 1',
    'fi',
    'cd "${DEPLOY_ROOT}"',
    'mkdir -p "${BACKUP_DIR}"',
    'RSYNC=(rsync -a)',
    'if [[ -n "${BACKUP_SSH_KEY}" ]]; then',
    'RSYNC+=( -e "ssh -i ${BACKUP_SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" )',
    'fi',
    'restart_prod() {',
    '"${COMPOSE[@]}" start agonara >/dev/null 2>&1 || true',
    '}',
    'trap restart_prod EXIT',
    '"${COMPOSE[@]}" stop agonara',
    'docker run --rm -v "${DATA_VOLUME}:/data:ro" -v "${BACKUP_DIR}:/backup" alpine:3.20 tar -czf "/backup/${BACKUP_FILE}" -C /data .',
    'test -s "${BACKUP_DIR}/${BACKUP_FILE}"',
    'docker run --rm -v "${BACKUP_DIR}:/backup:ro" alpine:3.20 sh -c \'tar -tzf "/backup/$1" | grep -Fx "./agonara.sqlite"\' sh "${BACKUP_FILE}" >/dev/null',
    '"${COMPOSE[@]}" start agonara',
    'trap - EXIT',
    '"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"',
    'find "${BACKUP_DIR}" -type f -name "agonara-data-*.tar.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete',
    'echo "Production backup successful: ${BACKUP_FILE}"',
  ];
  if (!linesAppearInOrder(executableLines, requiredSequence)) {
    throw new Error(`${scriptPath} must create a non-empty production data archive, recover service, copy off-host, and prune local retention`);
  }
}

function checkProductionRestore() {
  const scriptPath = 'agonara/scripts/restore-prod.sh';
  const fullPath = join(repoRoot, scriptPath);
  if (!existsSync(fullPath)) {
    throw new Error(`${scriptPath} is missing`);
  }
  const executableLines = shellExecutableLines(readFileSync(fullPath, 'utf8'));
  const requiredSequence = [
    'set -euo pipefail',
    'DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"',
    'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-prod_agonara-data}"',
    'BACKUP_FILE="${1:-}"',
    'COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)',
    'if [[ -z "${BACKUP_FILE}" ]]; then',
    'echo "backup file path is required" >&2',
    'exit 1',
    'fi',
    'if [[ ! -f "${BACKUP_FILE}" ]]; then',
    'echo "backup file not found: ${BACKUP_FILE}" >&2',
    'exit 1',
    'fi',
    'test -s "${BACKUP_FILE}"',
    'BACKUP_BASENAME="$(basename "${BACKUP_FILE}")"',
    'docker run --rm -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c \'tar -tzf "/restore/$1" | grep -Fx "./agonara.sqlite"\' sh "${BACKUP_BASENAME}" >/dev/null',
    'cd "${DEPLOY_ROOT}"',
    '"${COMPOSE[@]}" down',
    'docker run --rm -v "${DATA_VOLUME}:/data" -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c \'find /data -mindepth 1 -exec rm -rf {} + && tar -xzf "/restore/$1" -C /data\' sh "${BACKUP_BASENAME}"',
    '"${COMPOSE[@]}" up -d --no-build --wait',
    'docker exec agonara node -e \'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))\'',
    'echo "Production restore successful"',
  ];
  if (!linesAppearInOrder(executableLines, requiredSequence)) {
    throw new Error(`${scriptPath} must validate the backup before replacing production data, restart without rebuild, and health-gate availability`);
  }
}

function checkStagingBackupAndRestore() {
  const backupPath = 'agonara/scripts/backup-staging.sh';
  const restorePath = 'agonara/scripts/restore-staging.sh';
  const backupFullPath = join(repoRoot, backupPath);
  const restoreFullPath = join(repoRoot, restorePath);
  if (!existsSync(backupFullPath)) {
    throw new Error(`${backupPath} is missing`);
  }
  if (!existsSync(restoreFullPath)) {
    throw new Error(`${restorePath} is missing`);
  }

  const backupLines = shellExecutableLines(readFileSync(backupFullPath, 'utf8'));
  const restoreLines = shellExecutableLines(readFileSync(restoreFullPath, 'utf8'));
  const backupSequence = [
    'set -euo pipefail',
    'DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"',
    'BACKUP_DIR="${AGONARA_BACKUP_DIR:-${DEPLOY_ROOT}/backups/staging}"',
    'BACKUP_REMOTE="${AGONARA_BACKUP_REMOTE:-}"',
    'BACKUP_SSH_KEY="${AGONARA_BACKUP_SSH_KEY:-}"',
    'BACKUP_RETENTION_DAYS="${AGONARA_BACKUP_RETENTION_DAYS:-14}"',
    'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-staging_agonara-staging-data}"',
    'TIMESTAMP="${AGONARA_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"',
    'BACKUP_FILE="agonara-staging-data-${TIMESTAMP}.tar.gz"',
    'COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yml)',
    'if [[ -z "${BACKUP_REMOTE}" ]]; then',
    'echo "AGONARA_BACKUP_REMOTE is required for off-host backup storage" >&2',
    'exit 1',
    'fi',
    'cd "${DEPLOY_ROOT}"',
    'mkdir -p "${BACKUP_DIR}"',
    'RSYNC=(rsync -a)',
    'if [[ -n "${BACKUP_SSH_KEY}" ]]; then',
    'RSYNC+=( -e "ssh -i ${BACKUP_SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" )',
    'fi',
    'restart_staging() {',
    '"${COMPOSE[@]}" start agonara >/dev/null 2>&1 || true',
    '}',
    'trap restart_staging EXIT',
    '"${COMPOSE[@]}" stop agonara',
    'docker run --rm -v "${DATA_VOLUME}:/data:ro" -v "${BACKUP_DIR}:/backup" alpine:3.20 tar -czf "/backup/${BACKUP_FILE}" -C /data .',
    'test -s "${BACKUP_DIR}/${BACKUP_FILE}"',
    'docker run --rm -v "${BACKUP_DIR}:/backup:ro" alpine:3.20 sh -c \'tar -tzf "/backup/$1" | grep -Fx "./agonara.sqlite"\' sh "${BACKUP_FILE}" >/dev/null',
    '"${COMPOSE[@]}" start agonara',
    'trap - EXIT',
    '"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"',
    'find "${BACKUP_DIR}" -type f -name "agonara-staging-data-*.tar.gz" -mtime "+${BACKUP_RETENTION_DAYS}" -delete',
    'echo "Staging backup successful: ${BACKUP_FILE}"',
  ];
  const restoreSequence = [
    'set -euo pipefail',
    'DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"',
    'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-staging_agonara-staging-data}"',
    'BACKUP_FILE="${1:-}"',
    'COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yml)',
    'if [[ -z "${BACKUP_FILE}" ]]; then',
    'echo "backup file path is required" >&2',
    'exit 1',
    'fi',
    'if [[ ! -f "${BACKUP_FILE}" ]]; then',
    'echo "backup file not found: ${BACKUP_FILE}" >&2',
    'exit 1',
    'fi',
    'test -s "${BACKUP_FILE}"',
    'BACKUP_BASENAME="$(basename "${BACKUP_FILE}")"',
    'docker run --rm -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c \'tar -tzf "/restore/$1" | grep -Fx "./agonara.sqlite"\' sh "${BACKUP_BASENAME}" >/dev/null',
    'cd "${DEPLOY_ROOT}"',
    '"${COMPOSE[@]}" down',
    'docker run --rm -v "${DATA_VOLUME}:/data" -v "$(dirname "${BACKUP_FILE}"):/restore:ro" alpine:3.20 sh -c \'find /data -mindepth 1 -exec rm -rf {} + && tar -xzf "/restore/$1" -C /data\' sh "${BACKUP_BASENAME}"',
    '"${COMPOSE[@]}" up -d --no-build --wait',
    'docker exec agonara-staging node -e \'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))\'',
    'echo "Staging restore successful"',
  ];
  if (!linesAppearInOrder(backupLines, backupSequence) || !linesAppearInOrder(restoreLines, restoreSequence)) {
    throw new Error('Agonara staging backup and restore scripts must validate the database archive before transfer or data replacement');
  }
}

function checkWorkflowHealthGate(workflowJob, containerName) {
  const healthGate = `docker exec -e EXPECTED_VERSION="\${EXPECTED_VERSION}" ${containerName} node -e 'fetch("http://127.0.0.1:8080/operations/health").then(response => { if (!response.ok) process.exit(1); return response.json(); }).then(health => { if (health.status !== "ok" || health.version !== process.env.EXPECTED_VERSION) process.exit(1); }).catch(() => process.exit(1))'`;
  if (!workflowJob.includes(healthGate)) {
    throw new Error('release-unit.yml must health-gate Agonara workflow version checks on HTTP success before parsing JSON');
  }
}

function checkWorkflowSmokeGate(workflowJob, containerName) {
  const smokeGate = `docker exec -e AGONARA_SMOKE_BASE_URL=http://127.0.0.1:8080 -e EXPECTED_VERSION="\${EXPECTED_VERSION}" ${containerName} sh -lc "trap 'rm -f /tmp/agonara-smoke.json' EXIT; node scripts/smoke-open-answer-evaluator.mjs > /tmp/agonara-smoke.json && node -e 'const fs = require(\\"node:fs\\"); const result = JSON.parse(fs.readFileSync(\\"/tmp/agonara-smoke.json\\", \\"utf8\\")); if (!result.evaluationId || result.healthVersion !== process.env.EXPECTED_VERSION) process.exit(1);'"`;
  if (!workflowJob.includes(smokeGate)) {
    throw new Error('release-unit.yml must run Agonara real evaluator smoke with cleanup and expected version checks');
  }
}

function checkWorkflowPublicProdSmokeGate(workflowJob) {
  const smokeGate = 'docker exec -e AGONARA_PUBLIC_SMOKE_BASE_URL=https://agonara.enoa.ai -e EXPECTED_VERSION="${EXPECTED_VERSION}" agonara node scripts/smoke-public-prod-routes.mjs';
  if (!workflowJob.includes(smokeGate)) {
    throw new Error('release-unit.yml must verify Agonara public production Learn, Admin gate, and health routes');
  }
}

function checkWorkflowDeployJobGates(stagingJob, prodJob) {
  const stagingNeeds = workflowJobNeeds(stagingJob);
  const prodNeeds = workflowJobNeeds(prodJob);
  const basenameGate = "if: ${{ needs.verify.outputs.basename == 'agonara' }}";
  const validGates = stagingJob.includes(basenameGate)
    && prodJob.includes(basenameGate)
    && stagingNeeds.has('core')
    && stagingNeeds.has('verify')
    && prodNeeds.has('deploy-agonara-staging')
    && prodNeeds.has('verify');
  if (!validGates) {
    throw new Error('release-unit.yml Agonara deploy jobs must be scoped to Agonara tags and promote staging before production');
  }
}

function checkWorkflowCleanupLifecycle(stagingJob, prodJob) {
  const stagingCleanup = getWorkflowStep(stagingJob, 'Clean deploy upload after staging failure');
  const rollback = getWorkflowStep(prodJob, 'Rollback production on failure');
  const finalCleanup = getWorkflowStep(prodJob, 'Clean deploy upload');
  const validLifecycle = stagingCleanup.includes('if: failure()')
    && stagingCleanup.includes('script: rm -rf /tmp/agonara-deploy || true')
    && rollback.includes('if: failure()')
    && rollback.includes('script: bash /opt/agonara/scripts/rollback-prod.sh')
    && finalCleanup.includes('if: always()')
    && finalCleanup.includes('script: rm -rf /tmp/agonara-deploy || true')
    && prodJob.indexOf(rollback) < prodJob.indexOf(finalCleanup);
  if (!validLifecycle) {
    throw new Error('release-unit.yml must cleanup staging failures and run production rollback before final upload cleanup');
  }
}

function checkWorkflowNotifyFanIn(workflow) {
  const notifyJob = getWorkflowJob(workflow, 'notify');
  const notifyNeeds = workflowJobNeeds(notifyJob);
  const requiredNeedles = [
    "needs.deploy-agonara-staging.result == 'failure'",
    "needs.deploy-agonara-prod.result == 'failure'",
    'deploy-agonara-staging=${{ needs.deploy-agonara-staging.result }}',
    'deploy-agonara-prod=${{ needs.deploy-agonara-prod.result }}',
  ];
  const dependsOnAgonaraDeploys = notifyNeeds.has('deploy-agonara-staging') && notifyNeeds.has('deploy-agonara-prod');
  if (!dependsOnAgonaraDeploys || !requiredNeedles.every($0 => notifyJob.includes($0))) {
    throw new Error('release-unit.yml notify job must include Agonara deploy failures and report their results');
  }
}

function checkWorkflowGithubReleaseFanIn(workflow) {
  const githubReleaseJob = getWorkflowJob(workflow, 'github-release');
  const releaseNeeds = workflowJobNeeds(githubReleaseJob);
  const requiredNeedles = [
    "(needs.verify.outputs.basename != 'agonara' || needs.deploy-agonara-staging.result == 'success')",
    "(needs.verify.outputs.basename != 'agonara' || needs.deploy-agonara-prod.result == 'success')",
  ];
  const dependsOnAgonaraDeploys = releaseNeeds.has('deploy-agonara-staging') && releaseNeeds.has('deploy-agonara-prod');
  if (!dependsOnAgonaraDeploys || !requiredNeedles.every($0 => githubReleaseJob.includes($0))) {
    throw new Error('release-unit.yml github-release job must require successful Agonara deploys before release creation');
  }
}

function appearsInOrder(text, needles) {
  let cursor = -1;
  for (const needle of needles) {
    const index = text.indexOf(needle, cursor + 1);
    if (index === -1) {
      return false;
    }
    cursor = index;
  }
  return true;
}

function linesAppearInOrder(lines, requiredLines) {
  let cursor = -1;
  for (const requiredLine of requiredLines) {
    const index = lines.indexOf(requiredLine, cursor + 1);
    if (index === -1) {
      return false;
    }
    cursor = index;
  }
  return true;
}

function shellExecutableLines(script) {
  return script
    .split('\n')
    .map($0 => $0.trim())
    .filter($0 => $0 !== '' && !$0.startsWith('#'));
}

function getWorkflowJob(workflow, jobName) {
  const match = workflow.match(new RegExp(`(^|\\n)  ${jobName}:\\n([\\s\\S]*?)(?=\\n  [A-Za-z0-9_-]+:|$)`));
  if (!match) {
    throw new Error(`release-unit.yml missing ${jobName}:`);
  }
  return match[2];
}

function getWorkflowStep(workflowJob, stepName) {
  const escapedStepName = stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = workflowJob.match(new RegExp(`(^|\\n)\\s+- name: ${escapedStepName}\\n([\\s\\S]*?)(?=\\n\\s+- name:|$)`));
  return match?.[0] ?? '';
}

function workflowJobNeeds(workflowJob) {
  const match = workflowJob.match(/(^|\n)\s+needs:\s*\[([^\]]+)\]/);
  if (!match) {
    return new Set();
  }
  return new Set(match[2].split(',').map($0 => $0.trim()).filter(Boolean));
}

function checkGithubDeploySecretNames() {
  let stdout;
  try {
    stdout = execFileSync('gh', ['secret', 'list', '--json', 'name'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`unable to list GitHub secret names with gh: ${formatCommandError(error)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('gh secret list returned invalid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('gh secret list returned an unexpected payload');
  }

  const presentSecretNames = new Set(parsed
    .map($0 => $0?.name)
    .filter($0 => typeof $0 === 'string'));
  const missingSecretNames = requiredGithubDeploySecretNames
    .filter($0 => !presentSecretNames.has($0));
  if (missingSecretNames.length > 0) {
    throw new Error(`missing GitHub deploy secret names: ${missingSecretNames.join(', ')}`);
  }
  checks.push('github deploy secret names');
}

function formatCommandError(error) {
  const stderr = error.stderr?.toString().trim();
  const message = stderr || error.message || 'unknown error';
  return message.split('\n')[0];
}
