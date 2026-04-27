import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function settingsCandidates(workingDirectory, fileName, options = {}) {
  const homeDirectory = options.homeDirectory ?? homedir();

  return [
    join(workingDirectory, ".regentara", fileName),
    join(homeDirectory, ".regentara", fileName),
  ];
}

export async function firstExistingSettingsPath(workingDirectory, fileName, options = {}) {
  const candidates = settingsCandidates(workingDirectory, fileName, options);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
