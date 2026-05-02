import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("deploy expected version", () => {
  it("derive shouldUseFrontendReleaseTag_onFrontendReleaseTag", () => {
    expect(runDeployExpectedVersion({ GITHUB_REF_NAME: "notio-frontend_v0.1.1" })).toBe("v0.1.1");
  });

  it("derive shouldUsePackageVersion_onManualDeploy", () => {
    expect(runDeployExpectedVersion({ GITHUB_REF_NAME: "" })).toBe(`v${packageVersion()}`);
  });

  it("derive shouldRejectTag_onNonFrontendReleaseTag", () => {
    expect(runDeployExpectedVersion({ GITHUB_REF_NAME: "notio-backend_v0.1.1", GITHUB_REF_TYPE: "tag" })).toContain(
      "Unsupported frontend release tag: notio-backend_v0.1.1"
    );
  });

  it("derive shouldRejectTag_onMalformedFrontendReleaseTag", () => {
    expect(runDeployExpectedVersion({ GITHUB_REF_NAME: "notio-frontend_0.1.1", GITHUB_REF_TYPE: "tag" })).toContain(
      "Unsupported frontend release tag: notio-frontend_0.1.1"
    );
  });
});

function runDeployExpectedVersion(env: NodeJS.ProcessEnv): string {
  try {
    return execFileSync("node", ["scripts/deploy-expected-version.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ...env
      }
    }).trim();
  } catch (error) {
    return `deploy expected version failed: ${error}`;
  }
}

function packageVersion(): string {
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}
