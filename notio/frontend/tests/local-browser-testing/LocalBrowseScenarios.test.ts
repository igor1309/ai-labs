import { existsSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalRuntime } from "../../src/local-browser-testing/createLocalRuntime";

const LOCAL_BROWSE_SCENARIO_KEY = "VITE_NOTIO_LOCAL_BROWSE_SCENARIO";

describe("local browse scenarios", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("file shouldExist_onLocalBrowserTestingScenarioCatalog", () => {
    expect(existsSync("src/local-browser-testing/localBrowseScenarios.ts")).toBe(true);
  });

  it("loadedScenario shouldExposeItemsAndNextCursor_onDefaultLocalScenario", async () => {
    const scenarios = await import("../../src/local-browser-testing/localBrowseScenarios");

    expect(scenarios.localBrowseScenarios.loaded.firstPages[0]).toMatchObject({
      items: [{ capturedTitle: "Local browser testing item 1" }],
      nextCursor: {
        id: "local-browser-item-1"
      }
    });
  });

  it("createLocalRuntime shouldUseEmptyScenario_onExplicitLocalBrowseScenarioEnv", async () => {
    vi.stubEnv(LOCAL_BROWSE_SCENARIO_KEY, "empty");
    const runtime = createLocalRuntime();

    const page = await runtime.reader.fetchFirstPage();

    expect(page).toEqual({ items: [], nextCursor: null });
  });
});
