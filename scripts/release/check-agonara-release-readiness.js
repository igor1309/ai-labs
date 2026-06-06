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
  if (!appearsInOrder(stagingJob, [
    'Prepare clean Agonara deploy upload',
    'rm -rf /tmp/agonara-deploy',
    'Copy source files to VPS',
  ])) {
    throw new Error('release-unit.yml must clean /tmp/agonara-deploy before copying Agonara source');
  }
  const prodJob = getWorkflowJob(workflow, 'deploy-agonara-prod');
  checkWorkflowHealthGate(stagingJob, 'agonara-staging');
  checkWorkflowHealthGate(prodJob, 'agonara');
  checkWorkflowSmokeGate(stagingJob, 'agonara-staging');
  checkWorkflowSmokeGate(prodJob, 'agonara');
  checkWorkflowCleanupLifecycle(stagingJob, prodJob);
  checkWorkflowNotifyFanIn(workflow);
  checks.push('release workflow');

  checkLockedReleaseInstall(version, workflow);
  checkDeployUploadPreflight('agonara/scripts/deploy-staging.sh', 'compose.staging.yml');
  checkDeployUploadPreflight('agonara/scripts/deploy-prod.sh', 'compose.prod.yml');
  checks.push('deploy upload preflight');
  checkDeployHealthGate('agonara/scripts/deploy-staging.sh');
  checkDeployHealthGate('agonara/scripts/deploy-prod.sh');
  checks.push('deploy health gate');

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
