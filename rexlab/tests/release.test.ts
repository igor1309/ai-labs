import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workerHeader, workerVersion } from "../src/offline/offlineCache.ts";
import {
  expectedVersion,
  pageVersion,
  stampVersion,
  verifyDeployedVersion,
  verifyRelease,
  type SmokeDeps
} from "../src/release";

const INDEX_HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("stampVersion", () => {
  it("writes the version into the page's meta tag and footer", () => {
    const html = stampVersion(INDEX_HTML, "v1.2.3");

    expect(pageVersion(html)).toBe("v1.2.3");
    expect(html).toContain('<footer id="version" aria-label="Version" data-turn-fade>v1.2.3</footer>');
    expect(html).not.toContain("%REXLAB_VERSION%");
  });
});

describe("pageVersion", () => {
  it("is undefined for a page without the version meta tag", () => {
    expect(pageVersion("<html><head></head></html>")).toBeUndefined();
  });
});

describe("expectedVersion", () => {
  it("takes the version from a rexlab release tag", () => {
    expect(expectedVersion({ name: "rexlab_v0.2.0", type: "tag" }, "0.1.0")).toBe("v0.2.0");
  });

  it("rejects another unit's tag", () => {
    expect(() => expectedVersion({ name: "notio-frontend_v0.1.0", type: "tag" }, "0.1.0")).toThrow(
      "Unsupported rexlab release tag: notio-frontend_v0.1.0"
    );
  });

  it("uses the package version for a branch build", () => {
    expect(expectedVersion({ name: "trunk", type: "branch" }, "0.1.0")).toBe("v0.1.0");
    expect(expectedVersion({}, "0.1.0")).toBe("v0.1.0");
  });
});

describe("verifyDeployedVersion", () => {
  function deps(responses: Array<{ status: number; body: string } | Error>) {
    const sleeps: number[] = [];
    const logs: string[] = [];
    const fetched: string[] = [];
    const smoke: SmokeDeps = {
      fetchPage: async (target) => {
        fetched.push(target);
        const next = responses.shift();
        if (!next) throw new Error("no more responses");
        if (next instanceof Error) throw next;
        return next;
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      log: (line) => logs.push(line)
    };
    return { smoke, sleeps, logs, fetched };
  }

  const page = (version: string) => ({ status: 200, body: stampVersion(INDEX_HTML, version) });

  it("passes as soon as the page reports the expected version", async () => {
    const { smoke, sleeps } = deps([page("v0.1.0")]);

    await verifyDeployedVersion("https://rexlab.test", "v0.1.0", smoke);

    expect(sleeps).toEqual([]);
  });

  it("retries through errors, bad statuses and an old version", async () => {
    const { smoke, sleeps } = deps([new Error("ECONNRESET"), { status: 522, body: "" }, page("v0.0.9"), page("v0.1.0")]);

    await verifyDeployedVersion("https://rexlab.test", "v0.1.0", smoke, 5, 10);

    expect(sleeps).toEqual([10, 10, 10]);
  });

  it("reads the version where it is told to, as the worker's header", async () => {
    const { smoke, sleeps } = deps([{ status: 200, body: workerHeader("v0.0.9") }, { status: 200, body: `${workerHeader("v0.1.0")}self.x=1;` }]);

    await verifyDeployedVersion("https://rexlab.test/sw.js", "v0.1.0", { ...smoke, read: workerVersion }, 5, 10);

    expect(sleeps).toEqual([10]);
  });

  it("checks a release's page and then the worker beside it", async () => {
    const { smoke, fetched } = deps([page("v0.1.0"), { status: 200, body: `${workerHeader("v0.1.0")}self.x=1;` }]);

    await verifyRelease("https://rexlab.test/", "v0.1.0", smoke);

    expect(fetched).toEqual(["https://rexlab.test/", "https://rexlab.test/sw.js"]);
  });

  it("fails a release whose worker is an older one", async () => {
    const { smoke } = deps([page("v0.1.0"), ...Array(12).fill({ status: 200, body: workerHeader("v0.0.9") })]);

    await expect(verifyRelease("https://rexlab.test/", "v0.1.0", smoke)).rejects.toThrow(/sw\.js, got version v0\.0\.9/);
  });

  it("fails with the last observation once attempts run out", async () => {
    const { smoke, sleeps } = deps([page("v0.0.9"), page("v0.0.9")]);

    await expect(verifyDeployedVersion("https://rexlab.test", "v0.1.0", smoke, 2, 10)).rejects.toThrow(
      "Expected deployed version v0.1.0 at https://rexlab.test, got version v0.0.9"
    );
    expect(sleeps).toEqual([10]);
  });
});
