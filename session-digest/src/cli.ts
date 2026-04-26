import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Writable } from "node:stream";

import { defaultClock } from "./clock.js";
import { InputError, validateInputPath } from "./inputs.js";

export type MainDeps = {
  clock?: () => Date;
  baseDir?: string;
  fsLike?: Pick<typeof fs.promises, "stat" | "readFile" | "writeFile" | "mkdir">;
};

export async function main(
  argv: string[],
  _stdout: Writable,
  stderr: Writable,
  deps: MainDeps = {},
): Promise<number> {
  if (argv.length !== 1) {
    stderr.write("Expected exactly one session JSONL path.\n");

    return 1;
  }

  if (argv[0]?.startsWith("-")) {
    stderr.write("Flags are not supported. Pass exactly one session JSONL path.\n");

    return 1;
  }

  const clock = deps.clock ?? defaultClock;
  const baseDir = deps.baseDir ?? path.join(os.homedir(), ".session-digests");
  const fsLike = deps.fsLike ?? fs.promises;

  void clock;
  void baseDir;

  try {
    await validateInputPath(argv[0], fsLike);
  } catch (error) {
    if (error instanceof InputError) {
      stderr.write(`${error.message}\n`);

      return 1;
    }

    throw error;
  }

  return 0;
}
