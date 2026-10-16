import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { expectedVersion, verifyDeployedVersion } from "../src/release";

const url = requiredEnv("REXLAB_URL");
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const expected = expectedVersion(
  { name: process.env.GITHUB_REF_NAME, type: process.env.GITHUB_REF_TYPE },
  packageVersion
);

await verifyDeployedVersion(url, expected, {
  fetchPage: async (target) => {
    const response = await fetch(`${target}?smoke=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    return { status: response.status, body: await response.text() };
  },
  sleep: (ms) => sleep(ms),
  log: (line) => console.log(line)
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
