import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { StartupValidationFailure } from "./errors.js";

export async function validateProviderCliAvailability(modelRouting, options = {}) {
  const commandExists = options.commandExists ?? ((command) => defaultCommandExists(command, options));
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

async function defaultCommandExists(command, options = {}) {
  const environment = options.environment ?? process.env;
  const fileIsExecutable = options.fileIsExecutable ?? defaultFileIsExecutable;
  const executableExtensions = executableFileExtensions(environment);
  const pathEntries = (environment.PATH ?? "")
    .split(delimiter)
    .filter(Boolean);

  for (const pathEntry of pathEntries) {
    for (const extension of executableExtensions) {
      if (await fileIsExecutable(join(pathEntry, `${command}${extension}`))) {
        return true;
      }
    }
  }

  return false;
}

async function defaultFileIsExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableFileExtensions(environment) {
  if (process.platform !== "win32") {
    return [""];
  }

  return (environment.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean);
}
