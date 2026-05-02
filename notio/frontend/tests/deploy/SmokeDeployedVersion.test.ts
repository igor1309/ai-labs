import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("deployed version smoke check", () => {
  it("check shouldUseBrowserRenderedVersion_onConfiguredTarget", () => {
    const fakePlaywright = makeFakePlaywright();

    expect(runSmokeCheck(fakePlaywright, { EXPECTED_VERSION: "v0.1.1", FAKE_VERSION_TEXT: "v0.1.1" })).toContain(
      "Verified deployed Notio frontend version v0.1.1"
    );
    expect(readFileSync(fakePlaywright.logPath, "utf8").trim().split("\n")).toEqual([
      "launch",
      "newPage",
      "goto:https://notio.example",
      "getByLabel:Version",
      "textContent",
      "close"
    ]);
  });

  it("check shouldFail_onUnreachableTarget", () => {
    const fakePlaywright = makeFakePlaywright();

    expect(
      runSmokeCheck(fakePlaywright, { EXPECTED_VERSION: "v0.1.1", FAKE_GOTO_ERROR: "page unreachable", FAKE_VERSION_TEXT: "v0.1.1" })
    ).toContain("page unreachable");
  });

  it("check shouldFail_onMissingVersionElement", () => {
    const fakePlaywright = makeFakePlaywright();

    expect(runSmokeCheck(fakePlaywright, { EXPECTED_VERSION: "v0.1.1", FAKE_MISSING_VERSION: "1" })).toContain(
      "Version element missing"
    );
  });

  it("check shouldFail_onVersionMismatch", () => {
    const fakePlaywright = makeFakePlaywright();

    expect(runSmokeCheck(fakePlaywright, { EXPECTED_VERSION: "v0.1.1", FAKE_VERSION_TEXT: "v9.9.9" })).toContain(
      "Expected deployed version v0.1.1, received v9.9.9"
    );
  });
});

type FakePlaywright = {
  logPath: string;
  moduleUrl: string;
};

function makeFakePlaywright(): FakePlaywright {
  const directory = mkdtempSync(join(tmpdir(), "notio-smoke-"));
  const logPath = join(directory, "playwright.log");
  const modulePath = join(directory, "fake-playwright.mjs");

  writeFileSync(
    modulePath,
    `
import { appendFileSync } from "node:fs";

function log(message) {
  appendFileSync(process.env.FAKE_PLAYWRIGHT_LOG_PATH, message + "\\n");
}

export const chromium = {
  async launch() {
    log("launch");

    return {
      async close() {
        log("close");
      },
      async newPage() {
        log("newPage");

        return {
          getByLabel(label) {
            log("getByLabel:" + label);

            return {
              async textContent() {
                log("textContent");
                if (process.env.FAKE_MISSING_VERSION === "1") {
                  throw new Error("Version element missing");
                }

                return process.env.FAKE_VERSION_TEXT;
              }
            };
          },
          async goto(url) {
            log("goto:" + url);
            if (process.env.FAKE_GOTO_ERROR) {
              throw new Error(process.env.FAKE_GOTO_ERROR);
            }
          }
        };
      }
    };
  }
};
`,
    "utf8"
  );

  return {
    logPath,
    moduleUrl: `file://${modulePath}`
  };
}

function runSmokeCheck(fakePlaywright: FakePlaywright, env: NodeJS.ProcessEnv): string {
  try {
    return execFileSync("node", ["scripts/smoke-deployed-version.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
        FAKE_PLAYWRIGHT_LOG_PATH: fakePlaywright.logPath,
        NOTIO_FRONTEND_URL: "https://notio.example",
        NOTIO_SMOKE_PLAYWRIGHT_MODULE: fakePlaywright.moduleUrl
      }
    }).trim();
  } catch (error) {
    return `deployed version smoke check failed: ${error}`;
  }
}
