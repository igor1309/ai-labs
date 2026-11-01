import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { smokeDeployment } from "../src/release";

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

await smokeDeployment(process.env, packageVersion, {
  fetchFile: async (target: string) => {
    const response = await fetch(`${target}?smoke=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    return { status: response.status, body: await response.text() };
  },
  sleep: (ms: number) => sleep(ms),
  log: (line: string) => console.log(line)
});
