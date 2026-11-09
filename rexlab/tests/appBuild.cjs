// The released app, built for the browser contracts. A job that runs several
// contracts builds it once and names its directory in REXLAB_APP_BUILD; a
// contract run alone builds its own and removes it afterwards.
const { mkdtemp, readdir, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, relative, resolve } = require("node:path");

const root = resolve(__dirname, "..");

// The app's directory and how to let it go: a shared build is kept.
async function appDir() {
  if (process.env.REXLAB_APP_BUILD) return { dir: resolve(process.env.REXLAB_APP_BUILD), done: async () => {} };
  const dir = await mkdtemp(join(tmpdir(), "rexlab-app-"));
  const { build } = await import("vite");
  await build({ root, logLevel: "error", build: { outDir: dir } });
  return { dir, done: () => rm(dir, { recursive: true, force: true }) };
}

// Every file of the app by its path from the site's root.
async function appFiles() {
  const { dir, done } = await appDir();
  try {
    const files = new Map();
    for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = join(entry.parentPath, entry.name);
      files.set(relative(dir, path).split("\\").join("/"), await readFile(path));
    }
    return files;
  } finally { await done(); }
}

module.exports = { root, appDir, appFiles };
