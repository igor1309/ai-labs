import { workerVersion } from "./offline/workerBuild.ts";
import { WORKER_FILE } from "./offline/registerWorker.ts";

const PLACEHOLDER = /%REXLAB_VERSION%/g;
const RELEASE_TAG = /^rexlab_(v.+)$/;
const VERSION_META = /<meta\s+name="rexlab-version"\s+content="([^"]*)"/;

export function stampVersion(html: string, version: string): string {
  return html.replace(PLACEHOLDER, version);
}

export function pageVersion(html: string): string | undefined {
  return VERSION_META.exec(html)?.[1];
}

// A rexlab release tag names the version to expect; any other tag is a
// mistake, and a branch build expects the version in package.json.
export function expectedVersion(
  ref: { name?: string | undefined; type?: string | undefined },
  packageVersion: string
): string {
  const tag = ref.name?.match(RELEASE_TAG);
  if (tag?.[1]) {
    return tag[1];
  }
  if (ref.type === "tag") {
    throw new Error(`Unsupported rexlab release tag: ${ref.name}`);
  }
  return `v${packageVersion}`;
}

export type SmokeDeps = {
  fetchFile: (url: string) => Promise<{ status: number; body: string }>;
  // How to read the version from the fetched file: the page's meta tag
  // unless told otherwise, as the worker's header is read.
  read?: (body: string) => string | undefined;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};

// A fresh Pages deployment can take a little while to reach the custom
// domain, so the check retries until the file reports the version.
export async function verifyDeployedVersion(
  url: string,
  expected: string,
  deps: SmokeDeps,
  attempts = 12,
  delayMs = 10_000
): Promise<void> {
  let last = "no response";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { status, body } = await deps.fetchFile(url);
      const found = status === 200 ? (deps.read ?? pageVersion)(body) : undefined;
      if (found === expected) {
        deps.log(`Verified deployed RexLab version ${expected} at ${url}`);
        return;
      }
      last = status === 200 ? `version ${found ?? "<missing>"}` : `HTTP ${status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    deps.log(`Attempt ${attempt}/${attempts}: expected ${expected}, got ${last}`);
    if (attempt < attempts) {
      await deps.sleep(delayMs);
    }
  }
  throw new Error(`Expected deployed version ${expected} at ${url}, got ${last}`);
}

// The deployed release: its page, and its service worker beside it, since
// the installed app updates through the worker.
export async function verifyRelease(url: string, expected: string, deps: SmokeDeps): Promise<void> {
  await verifyDeployedVersion(url, expected, deps);
  await verifyDeployedVersion(new URL(WORKER_FILE, url).href, expected, { ...deps, read: workerVersion });
}

// The deploy smoke check: the release the environment names, at the URL it
// names, page and worker both.
export async function smokeDeployment(env: Record<string, string | undefined>, packageVersion: string, deps: SmokeDeps): Promise<void> {
  const url = env.REXLAB_URL;
  if (!url?.trim()) {
    throw new Error("Missing required environment variable: REXLAB_URL");
  }
  const expected = expectedVersion({ name: env.GITHUB_REF_NAME, type: env.GITHUB_REF_TYPE }, packageVersion);
  await verifyRelease(url, expected, deps);
}
