import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const files = {
  stagingCompose: readText("../compose.staging.yml"),
  prodCompose: readText("../compose.prod.yml"),
  deployStaging: readText("../scripts/deploy-staging.sh"),
  deployProd: readText("../scripts/deploy-prod.sh"),
  rollbackProd: readText("../scripts/rollback-prod.sh"),
  backupProd: readText("../scripts/backup-prod.sh"),
  restoreProd: readText("../scripts/restore-prod.sh"),
};

test("deploymentCompose_shouldIsolateStagingAndProd_onDistinctLoopbackPortsAndVolumes", () => {
  assert.deepEqual(
    {
      stagingContainer: files.stagingCompose.includes("container_name: agonara-staging"),
      prodContainer: files.prodCompose.includes("container_name: agonara\n"),
      stagingPort: files.stagingCompose.includes('"127.0.0.1:18081:8080"'),
      prodPort: files.prodCompose.includes('"127.0.0.1:18080:8080"'),
      stagingVolume: files.stagingCompose.includes("agonara-staging-data:/data"),
      prodVolume: files.prodCompose.includes("agonara-data:/data"),
      stagingEnvFile: files.stagingCompose.includes("env_file: .env.staging"),
      prodEnvFile: files.prodCompose.includes("env_file: .env.prod"),
      stagingRequiresBootstrapSecret: files.stagingCompose.includes(
        "AGONARA_BOOTSTRAP_SECRET: ${AGONARA_BOOTSTRAP_SECRET:?Set AGONARA_BOOTSTRAP_SECRET}",
      ),
      prodRequiresBootstrapSecret: files.prodCompose.includes(
        "AGONARA_BOOTSTRAP_SECRET: ${AGONARA_BOOTSTRAP_SECRET:?Set AGONARA_BOOTSTRAP_SECRET}",
      ),
      stagingPassesProviderEnv: containsAll(files.stagingCompose, [
        "AGONARA_NOMOS_API_KEY",
        "AGONARA_NOMOS_BASE_URL",
        "AGONARA_NOMOS_MODEL",
        "AGONARA_OPEN_ANSWER_EVALUATOR_TRIGGER_TOKEN",
      ]),
      prodPassesProviderEnv: containsAll(files.prodCompose, [
        "AGONARA_NOMOS_API_KEY",
        "AGONARA_NOMOS_BASE_URL",
        "AGONARA_NOMOS_MODEL",
        "AGONARA_OPEN_ANSWER_EVALUATOR_TRIGGER_TOKEN",
      ]),
      exposesNonLoopbackPort: /-\s*"(?!127\.0\.0\.1:)\d+:\d+"/.test(
        `${files.stagingCompose}\n${files.prodCompose}`,
      ),
    },
    {
      stagingContainer: true,
      prodContainer: true,
      stagingPort: true,
      prodPort: true,
      stagingVolume: true,
      prodVolume: true,
      stagingEnvFile: true,
      prodEnvFile: true,
      stagingRequiresBootstrapSecret: true,
      prodRequiresBootstrapSecret: true,
      stagingPassesProviderEnv: true,
      prodPassesProviderEnv: true,
      exposesNonLoopbackPort: false,
    },
  );
});

test("deploymentScripts_shouldBuildOnVpsTagImagesAndHealthGate_onExpectedVersion", () => {
  assert.deepEqual(
    {
      stagingCopiesUploadedSource: containsAll(files.deployStaging, [
        "${UPLOAD_ROOT}/Dockerfile",
        "${UPLOAD_ROOT}/package.json",
        "${UPLOAD_ROOT}/src",
      ]),
      prodCopiesUploadedSource: containsAll(files.deployProd, [
        "${UPLOAD_ROOT}/Dockerfile",
        "${UPLOAD_ROOT}/package.json",
        "${UPLOAD_ROOT}/src",
      ]),
      stagingHandlesOptionalPackageLock: containsAll(files.deployStaging, [
        '${UPLOAD_ROOT}/package-lock.json',
        "cp",
      ]),
      prodHandlesOptionalPackageLock: containsAll(files.deployProd, [
        '${UPLOAD_ROOT}/package-lock.json',
        "cp",
      ]),
      stagingBuildsOnHost: files.deployStaging.includes('"${COMPOSE[@]}" build'),
      prodBuildsOnHost: files.deployProd.includes('"${COMPOSE[@]}" build'),
      stagingUsesEnvFileForInterpolation: files.deployStaging.includes(
        "COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yml)",
      ),
      prodUsesEnvFileForInterpolation: files.deployProd.includes(
        "COMPOSE=(docker compose --env-file .env.prod -f compose.prod.yml)",
      ),
      stagingReadsVersionAfterCopy: appearsInOrder(files.deployStaging, [
        'cp "${UPLOAD_ROOT}/package.json" .',
        'DEPLOY_VERSION="$(read_package_version package.json)"',
      ]),
      prodReadsVersionAfterCopy: appearsInOrder(files.deployProd, [
        'cp "${UPLOAD_ROOT}/package.json" .',
        'DEPLOY_VERSION="$(read_package_version package.json)"',
      ]),
      stagingBuildsBeforeDown: appearsInOrder(files.deployStaging, [
        '"${COMPOSE[@]}" build',
        '"${COMPOSE[@]}" down',
      ]),
      prodBuildsBeforeDown: appearsInOrder(files.deployProd, [
        '"${COMPOSE[@]}" build',
        '"${COMPOSE[@]}" down',
      ]),
      stagingTagsVersionAndSha: containsAll(files.deployStaging, [
        'docker tag agonara:staging "agonara:${DEPLOY_VERSION}"',
        'docker tag agonara:staging "agonara:${DEPLOY_GIT_SHA}"',
      ]),
      prodTagsVersionAndSha: containsAll(files.deployProd, [
        'docker tag agonara:latest "agonara:${DEPLOY_VERSION}"',
        'docker tag agonara:latest "agonara:${DEPLOY_GIT_SHA}"',
      ]),
      prodSnapshotsRollback: files.deployProd.includes("docker tag agonara:latest agonara:rollback || true"),
      rollbackUsesSnapshot: containsAll(files.rollbackProd, [
        "docker image inspect agonara:rollback",
        "docker tag agonara:rollback agonara:latest",
      ]),
      stagingHealthGatesVersion: containsAll(files.deployStaging, ["operations/health", "version", "DEPLOY_VERSION"]),
      prodHealthGatesVersion: containsAll(files.deployProd, ["operations/health", "version", "DEPLOY_VERSION"]),
    },
    {
      stagingCopiesUploadedSource: true,
      prodCopiesUploadedSource: true,
      stagingHandlesOptionalPackageLock: true,
      prodHandlesOptionalPackageLock: true,
      stagingBuildsOnHost: true,
      prodBuildsOnHost: true,
      stagingUsesEnvFileForInterpolation: true,
      prodUsesEnvFileForInterpolation: true,
      stagingReadsVersionAfterCopy: true,
      prodReadsVersionAfterCopy: true,
      stagingBuildsBeforeDown: true,
      prodBuildsBeforeDown: true,
      stagingTagsVersionAndSha: true,
      prodTagsVersionAndSha: true,
      prodSnapshotsRollback: true,
      rollbackUsesSnapshot: true,
      stagingHealthGatesVersion: true,
      prodHealthGatesVersion: true,
    },
  );
});

test("backupRestoreScripts_shouldRequireOffHostBackupAndRestoreThroughProdCompose", () => {
  assert.deepEqual(
    {
      backupRequiresRemote: files.backupProd.includes("AGONARA_BACKUP_REMOTE is required"),
      backupStopsContainer: files.backupProd.includes('"${COMPOSE[@]}" stop agonara'),
      backupArchivesDataVolume: files.backupProd.includes("-v agonara-data:/data:ro"),
      backupCopiesOffHost: files.backupProd.includes('rsync -a "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"'),
      restoreRequiresBackupFile: files.restoreProd.includes("backup file path is required"),
      restoreReplacesDataVolume: containsAll(files.restoreProd, [
        "-v agonara-data:/data",
        "find /data -mindepth 1",
        "tar -xzf",
      ]),
      restorePassesBackupBasenameAsArgument: containsAll(files.restoreProd, [
        'BACKUP_BASENAME="$(basename "${BACKUP_FILE}")"',
        'sh "${BACKUP_BASENAME}"',
      ]),
      restoreHealthGates: files.restoreProd.includes('"status":"ok"'),
    },
    {
      backupRequiresRemote: true,
      backupStopsContainer: true,
      backupArchivesDataVolume: true,
      backupCopiesOffHost: true,
      restoreRequiresBackupFile: true,
      restoreReplacesDataVolume: true,
      restorePassesBackupBasenameAsArgument: true,
      restoreHealthGates: true,
    },
  );
});

function readText(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function containsAll(text, needles) {
  return needles.every($0 => text.includes($0));
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
