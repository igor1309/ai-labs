import type * as fs from "node:fs";
import * as path from "node:path";

import { parse } from "dotenv";

export type Config = {
  apiKey: string;
  model: string;
};

export type ConfigFs = Pick<typeof fs.promises, "readFile" | "writeFile">;

const envExampleBody = "NVIDIA_API_KEY=\nNVIDIA_MODEL=\n";

export class ConfigError extends Error {}

export async function loadConfig(baseDir: string, fsLike: ConfigFs): Promise<Config> {
  let envBody: string;

  try {
    envBody = await fsLike.readFile(path.join(baseDir, ".env"), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      try {
        await fsLike.writeFile(path.join(baseDir, ".env.example"), envExampleBody, { flag: "wx" });
      } catch (writeError) {
        if (!isNodeError(writeError) || writeError.code !== "EEXIST") {
          throw writeError;
        }
      }

      throw new ConfigError("Create ~/.session-digests/.env from .env.example.");
    }

    if (isNodeError(error) && error.code === "EACCES") {
      throw new ConfigError("Cannot read ~/.session-digests/.env: permission denied.");
    }

    throw error;
  }

  const parsed = parse(envBody);

  if (!parsed.NVIDIA_API_KEY) {
    throw new ConfigError("Missing NVIDIA_API_KEY in ~/.session-digests/.env.");
  }

  if (!parsed.NVIDIA_MODEL) {
    throw new ConfigError("Missing NVIDIA_MODEL in ~/.session-digests/.env.");
  }

  return { apiKey: parsed.NVIDIA_API_KEY, model: parsed.NVIDIA_MODEL };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
