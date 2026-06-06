import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const files = {
  dockerfile: readText("../Dockerfile"),
  stagingCompose: readText("../compose.staging.yml"),
  prodCompose: readText("../compose.prod.yml"),
  deployStaging: readText("../scripts/deploy-staging.sh"),
  deployProd: readText("../scripts/deploy-prod.sh"),
  rollbackProd: readText("../scripts/rollback-prod.sh"),
  backupProd: readText("../scripts/backup-prod.sh"),
  restoreProd: readText("../scripts/restore-prod.sh"),
  backupStaging: readText("../scripts/backup-staging.sh"),
  restoreStaging: readText("../scripts/restore-staging.sh"),
};

test("deploymentImage_shouldMakeAppFilesReadableByRuntimeUser", () => {
  assert.deepEqual(
    {
      packageOwnedByRuntimeUser: files.dockerfile.includes(
        "COPY --chown=agonara:agonara package.json package-lock.json ./",
      ),
      lockfileOwnedByRuntimeUser: files.dockerfile.includes(
        "COPY --chown=agonara:agonara package.json package-lock.json ./",
      ),
      usesLockedProductionInstall: files.dockerfile.includes("RUN npm ci --omit=dev"),
      sourceOwnedByRuntimeUser: files.dockerfile.includes("COPY --chown=agonara:agonara src/ src/"),
      scriptsOwnedByRuntimeUser: files.dockerfile.includes("COPY --chown=agonara:agonara scripts/ scripts/"),
      healthcheckUsesRuntimeNode: files.dockerfile.includes("CMD node -e 'fetch("),
      appTreeChownedBeforeRuntimeUser: appearsInOrder(files.dockerfile, [
        "RUN chown -R agonara:agonara /app",
        "USER agonara",
      ]),
    },
    {
      packageOwnedByRuntimeUser: true,
      lockfileOwnedByRuntimeUser: true,
      usesLockedProductionInstall: true,
      sourceOwnedByRuntimeUser: true,
      scriptsOwnedByRuntimeUser: true,
      healthcheckUsesRuntimeNode: true,
      appTreeChownedBeforeRuntimeUser: true,
    },
  );
});

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
      stagingHealthcheckUsesRuntimeNode: files.stagingCompose.includes('test: ["CMD", "node", "-e", "fetch('),
      prodHealthcheckUsesRuntimeNode: files.prodCompose.includes('test: ["CMD", "node", "-e", "fetch('),
      composeDoesNotRequireWget: !`${files.stagingCompose}\n${files.prodCompose}`.includes("wget"),
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
      stagingHealthcheckUsesRuntimeNode: true,
      prodHealthcheckUsesRuntimeNode: true,
      composeDoesNotRequireWget: true,
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
        "${UPLOAD_ROOT}/package-lock.json",
        "${UPLOAD_ROOT}/src",
      ]),
      prodCopiesUploadedSource: containsAll(files.deployProd, [
        "${UPLOAD_ROOT}/Dockerfile",
        "${UPLOAD_ROOT}/package.json",
        "${UPLOAD_ROOT}/package-lock.json",
        "${UPLOAD_ROOT}/src",
      ]),
      stagingPreflightsRequiredUploadBeforeDeployRootMutation: appearsInOrder(files.deployStaging, [
        'require_upload_file "${UPLOAD_ROOT}/Dockerfile"',
        'require_upload_file "${UPLOAD_ROOT}/package.json"',
        'require_upload_file "${UPLOAD_ROOT}/package-lock.json"',
        'require_upload_file "${UPLOAD_ROOT}/compose.staging.yml"',
        'require_upload_directory "${UPLOAD_ROOT}/src"',
        'require_upload_directory "${UPLOAD_ROOT}/scripts"',
        "require_upload_payload",
        'cd "${DEPLOY_ROOT}"',
      ]),
      prodPreflightsRequiredUploadBeforeDeployRootMutation: appearsInOrder(files.deployProd, [
        'require_upload_file "${UPLOAD_ROOT}/Dockerfile"',
        'require_upload_file "${UPLOAD_ROOT}/package.json"',
        'require_upload_file "${UPLOAD_ROOT}/package-lock.json"',
        'require_upload_file "${UPLOAD_ROOT}/compose.prod.yml"',
        'require_upload_directory "${UPLOAD_ROOT}/src"',
        'require_upload_directory "${UPLOAD_ROOT}/scripts"',
        "require_upload_payload",
        'cd "${DEPLOY_ROOT}"',
      ]),
      stagingRequiresPackageLock: containsAll(files.deployStaging, [
        '${UPLOAD_ROOT}/package-lock.json',
        "cp",
      ]),
      prodRequiresPackageLock: containsAll(files.deployProd, [
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
      stagingResetsSourceFileUmask: appearsInOrder(files.deployStaging, ["set -euo pipefail", "umask 022"]),
      prodResetsSourceFileUmask: appearsInOrder(files.deployProd, ["set -euo pipefail", "umask 022"]),
      stagingNormalizesSourceFileModes: files.deployStaging.includes(
        "chmod -R u=rwX,go=rX Dockerfile package.json package-lock.json compose.staging.yml src scripts",
      ),
      prodNormalizesSourceFileModes: files.deployProd.includes(
        "chmod -R u=rwX,go=rX Dockerfile package.json package-lock.json compose.prod.yml src scripts",
      ),
      stagingReadsVersionAfterCopy: appearsInOrder(files.deployStaging, [
        'cp "${UPLOAD_ROOT}/package.json" .',
        'DEPLOY_VERSION="$(read_package_version package.json)"',
        'if [[ -z "${DEPLOY_VERSION}" ]]; then',
      ]),
      prodReadsVersionAfterCopy: appearsInOrder(files.deployProd, [
        'cp "${UPLOAD_ROOT}/package.json" .',
        'DEPLOY_VERSION="$(read_package_version package.json)"',
        'if [[ -z "${DEPLOY_VERSION}" ]]; then',
      ]),
      deployScriptsDoNotRequireHostNode: !`${files.deployStaging}\n${files.deployProd}`.includes("node -e 'const fs"),
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
      rollbackDoesNotRequireCurrentVersion: !files.rollbackProd.includes("EXPECTED_VERSION"),
      stagingHealthGatesVersion: containsAll(files.deployStaging, ["operations/health", "version", "DEPLOY_VERSION"]),
      prodHealthGatesVersion: containsAll(files.deployProd, ["operations/health", "version", "DEPLOY_VERSION"]),
      deployScriptsDoNotRequireWget: !`${files.deployStaging}\n${files.deployProd}\n${files.rollbackProd}`.includes(
        "wget",
      ),
    },
    {
      stagingCopiesUploadedSource: true,
      prodCopiesUploadedSource: true,
      stagingPreflightsRequiredUploadBeforeDeployRootMutation: true,
      prodPreflightsRequiredUploadBeforeDeployRootMutation: true,
      stagingRequiresPackageLock: true,
      prodRequiresPackageLock: true,
      stagingBuildsOnHost: true,
      prodBuildsOnHost: true,
      stagingUsesEnvFileForInterpolation: true,
      prodUsesEnvFileForInterpolation: true,
      stagingResetsSourceFileUmask: true,
      prodResetsSourceFileUmask: true,
      stagingNormalizesSourceFileModes: true,
      prodNormalizesSourceFileModes: true,
      stagingReadsVersionAfterCopy: true,
      prodReadsVersionAfterCopy: true,
      deployScriptsDoNotRequireHostNode: true,
      stagingBuildsBeforeDown: true,
      prodBuildsBeforeDown: true,
      stagingTagsVersionAndSha: true,
      prodTagsVersionAndSha: true,
      prodSnapshotsRollback: true,
      rollbackUsesSnapshot: true,
      rollbackDoesNotRequireCurrentVersion: true,
      stagingHealthGatesVersion: true,
      prodHealthGatesVersion: true,
      deployScriptsDoNotRequireWget: true,
    },
  );
});

test("backupRestoreScripts_shouldRequireOffHostBackupAndRestoreThroughProdCompose", () => {
  assert.deepEqual(
    {
      backupRequiresRemote: files.backupProd.includes("AGONARA_BACKUP_REMOTE is required"),
      backupStopsContainer: files.backupProd.includes('"${COMPOSE[@]}" stop agonara'),
      backupArchivesComposeDataVolume: containsAll(files.backupProd, [
        'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-prod_agonara-data}"',
        '-v "${DATA_VOLUME}:/data:ro"',
      ]),
      backupSupportsDedicatedSshKey: containsAll(files.backupProd, [
        "AGONARA_BACKUP_SSH_KEY",
        "IdentitiesOnly=yes",
      ]),
      backupRejectsEmptyArchive: files.backupProd.includes('test -s "${BACKUP_DIR}/${BACKUP_FILE}"'),
      backupPrunesLocalRetention: containsAll(files.backupProd, [
        "AGONARA_BACKUP_RETENTION_DAYS",
        'find "${BACKUP_DIR}" -type f -name "agonara-data-*.tar.gz"',
      ]),
      backupCopiesOffHost: files.backupProd.includes('"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"'),
      restoreRequiresBackupFile: files.restoreProd.includes("backup file path is required"),
      restoreReplacesComposeDataVolume: containsAll(files.restoreProd, [
        'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-prod_agonara-data}"',
        '-v "${DATA_VOLUME}:/data"',
        "find /data -mindepth 1",
        "tar -xzf",
      ]),
      restorePassesBackupBasenameAsArgument: containsAll(files.restoreProd, [
        'BACKUP_BASENAME="$(basename "${BACKUP_FILE}")"',
        'sh "${BACKUP_BASENAME}"',
      ]),
      restoreHealthGates: containsAll(files.restoreProd, ["operations/health", "response.ok"]),
    },
    {
      backupRequiresRemote: true,
      backupStopsContainer: true,
      backupArchivesComposeDataVolume: true,
      backupSupportsDedicatedSshKey: true,
      backupRejectsEmptyArchive: true,
      backupPrunesLocalRetention: true,
      backupCopiesOffHost: true,
      restoreRequiresBackupFile: true,
      restoreReplacesComposeDataVolume: true,
      restorePassesBackupBasenameAsArgument: true,
      restoreHealthGates: true,
    },
  );
});

test("stagingBackupRestoreScripts_shouldRehearseOffHostBackupAgainstStagingVolume", () => {
  assert.deepEqual(
    {
      backupRequiresRemote: files.backupStaging.includes("AGONARA_BACKUP_REMOTE is required"),
      backupUsesStagingCompose: files.backupStaging.includes(
        "COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yml)",
      ),
      backupArchivesStagingComposeVolume: containsAll(files.backupStaging, [
        'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-staging_agonara-staging-data}"',
        '-v "${DATA_VOLUME}:/data:ro"',
      ]),
      backupSupportsDedicatedSshKey: containsAll(files.backupStaging, [
        "AGONARA_BACKUP_SSH_KEY",
        "IdentitiesOnly=yes",
      ]),
      backupRejectsEmptyArchive: files.backupStaging.includes('test -s "${BACKUP_DIR}/${BACKUP_FILE}"'),
      backupPrunesLocalRetention: containsAll(files.backupStaging, [
        "AGONARA_BACKUP_RETENTION_DAYS",
        'find "${BACKUP_DIR}" -type f -name "agonara-staging-data-*.tar.gz"',
      ]),
      backupCopiesOffHost: files.backupStaging.includes('"${RSYNC[@]}" "${BACKUP_DIR}/${BACKUP_FILE}" "${BACKUP_REMOTE}/"'),
      restoreUsesStagingCompose: files.restoreStaging.includes(
        "COMPOSE=(docker compose --env-file .env.staging -f compose.staging.yml)",
      ),
      restoreReplacesStagingComposeVolume: containsAll(files.restoreStaging, [
        'DATA_VOLUME="${AGONARA_DATA_VOLUME:-agonara-staging_agonara-staging-data}"',
        '-v "${DATA_VOLUME}:/data"',
        "find /data -mindepth 1",
        "tar -xzf",
      ]),
      restoreHealthGatesStaging: containsAll(files.restoreStaging, [
        "docker exec agonara-staging",
        "operations/health",
        "response.ok",
      ]),
    },
    {
      backupRequiresRemote: true,
      backupUsesStagingCompose: true,
      backupArchivesStagingComposeVolume: true,
      backupSupportsDedicatedSshKey: true,
      backupRejectsEmptyArchive: true,
      backupPrunesLocalRetention: true,
      backupCopiesOffHost: true,
      restoreUsesStagingCompose: true,
      restoreReplacesStagingComposeVolume: true,
      restoreHealthGatesStaging: true,
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
