import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { StartupValidationFailure } from "./errors.js";

const execFileAsync = promisify(execFile);

export async function validateProviderCliAvailability(modelRouting, options = {}) {
  const commandExists = options.commandExists ?? defaultCommandExists;
  const runners = new Set(
    Object.values(modelRouting.routes ?? {}).map((route) => route.runner),
  );

  for (const runner of runners) {
    if (!(await commandExists(runner))) {
      throw new StartupValidationFailure(`required provider CLI unavailable: ${runner}`);
    }
  }

  return {
    available: true,
  };
}

async function defaultCommandExists(command) {
  try {
    await execFileAsync("command", ["-v", command], { shell: true });
    return true;
  } catch {
    return false;
  }
}
