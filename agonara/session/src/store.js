import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Keeps session and polling offset in one file; a rename keeps it whole on a crash.
export function createStore(path, emptyState) {
  return {
    load() {
      try {
        return JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return emptyState();
        throw error;
      }
    },
    save(state) {
      mkdirSync(dirname(path), { recursive: true });
      const temp = `${path}.tmp`;
      writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
      renameSync(temp, path);
    },
  };
}
