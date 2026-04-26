import type * as fs from "node:fs";

const ONE_MB = 1024 * 1024;

export type StatFs = Pick<typeof fs.promises, "stat">;

export class InputError extends Error {
  static missingFile(path: string): InputError {
    return new InputError(`Input file does not exist: ${path}`);
  }

  static notAFile(path: string): InputError {
    return new InputError(`Input path is not a file: ${path}`);
  }

  static unreadable(path: string, code: string): InputError {
    return new InputError(`Input file is unreadable (${code}): ${path}`);
  }

  static emptyFile(path: string): InputError {
    return new InputError(`Input file is empty: ${path}`);
  }

  static oversize(path: string): InputError {
    return new InputError(`Input file exceeds 1 MB max size: ${path}`);
  }
}

export async function validateInputPath(inputPath: string, fsLike: StatFs): Promise<void> {
  let stats: Awaited<ReturnType<StatFs["stat"]>>;

  try {
    stats = await fsLike.stat(inputPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw InputError.missingFile(inputPath);
    }

    if (isNodeError(error) && error.code === "EACCES") {
      throw InputError.unreadable(inputPath, error.code);
    }

    throw error;
  }

  if (!stats.isFile()) {
    throw InputError.notAFile(inputPath);
  }

  if (stats.size === 0) {
    throw InputError.emptyFile(inputPath);
  }

  if (stats.size > ONE_MB) {
    throw InputError.oversize(inputPath);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
