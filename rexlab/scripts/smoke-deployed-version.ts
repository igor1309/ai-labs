import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { workerVersion } from "../src/offline/offlineCache";
import { WORKER_FILE } from "../src/offline/registerWorker";
import { expectedVersion, verifyDeployedVersion } from "../src/release";

const url = requiredEnv("REXLAB_URL");
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const expected = expectedVersion(
  { name: process.env.GITHUB_REF_NAME, type: process.env.GITHUB_REF_TYPE },
  packageVersion
);

const deps = {
  fetchPage: async (target: string) => {
    const response = await fetch(`${target}?smoke=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    return { status: response.status, body: await response.text() };
  },
  sleep: (ms: number) => sleep(ms),
  log: (line: string) => console.log(line)
};

await verifyDeployedVersion(url, expected, deps);
// The installed app updates through its worker, so the worker must be
// this release's too.
await verifyDeployedVersion(new URL(WORKER_FILE, url).href, expected, { ...deps, read: workerVersion });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
