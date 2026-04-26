import type * as fs from "node:fs";
import * as path from "node:path";

import { parse } from "dotenv";

export type Config = {
  apiKey: string;
  baseURL: string;
  model: string;
  provider: string;
};

export type ConfigFs = Pick<typeof fs.promises, "readFile" | "writeFile">;

const openRouterBaseURL = "https://openrouter.ai/api/v1";
const nvidiaBaseURL = "https://integrate.api.nvidia.com/v1";

const envExampleBody = [
  "# OpenRouter direct",
  "OPENROUTER_API_KEY=",
  "OPENROUTER_MODEL=",
  "",
  "# Nomos local proxy",
  "NOMOS_API_KEY=",
  "NOMOS_MODEL=",
  "NOMOS_BASE_URL=http://localhost:8080/v1",
  "",
  "# NVIDIA NIM legacy path",
  "NVIDIA_API_KEY=",
  "NVIDIA_MODEL=",
  "",
].join("\n");

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
  const config = openRouterConfig(parsed) ?? nomosConfig(parsed) ?? nvidiaConfig(parsed);

  if (config) {
    return config;
  }

  throw missingConfigError(parsed);
}

function openRouterConfig(parsed: Record<string, string>): Config | undefined {
  return configFromPair({
    apiKey: parsed.OPENROUTER_API_KEY,
    baseURL: openRouterBaseURL,
    model: parsed.OPENROUTER_MODEL,
    provider: "openrouter",
  });
}

function nomosConfig(parsed: Record<string, string>): Config | undefined {
  return configFromPair({
    apiKey: parsed.NOMOS_API_KEY,
    baseURL: parsed.NOMOS_BASE_URL ?? "http://localhost:8080/v1",
    model: parsed.NOMOS_MODEL,
    provider: "nomos",
  });
}

function nvidiaConfig(parsed: Record<string, string>): Config | undefined {
  return configFromPair({
    apiKey: parsed.NVIDIA_API_KEY,
    baseURL: nvidiaBaseURL,
    model: parsed.NVIDIA_MODEL,
    provider: "nvidia_nim",
  });
}

function configFromPair(config: Config): Config | undefined {
  if (!config.apiKey || !config.model) {
    return undefined;
  }

  return { ...config, baseURL: trimTrailingSlash(config.baseURL) };
}

function missingConfigError(parsed: Record<string, string>): ConfigError {
  if (parsed.OPENROUTER_MODEL) {
    return new ConfigError("Missing OPENROUTER_API_KEY in ~/.session-digests/.env.");
  }

  if (parsed.OPENROUTER_API_KEY) {
    return new ConfigError("Missing OPENROUTER_MODEL in ~/.session-digests/.env.");
  }

  if (parsed.NOMOS_MODEL) {
    return new ConfigError("Missing NOMOS_API_KEY in ~/.session-digests/.env.");
  }

  if (parsed.NOMOS_API_KEY) {
    return new ConfigError("Missing NOMOS_MODEL in ~/.session-digests/.env.");
  }

  if (parsed.NVIDIA_MODEL) {
    return new ConfigError("Missing NVIDIA_API_KEY in ~/.session-digests/.env.");
  }

  if (parsed.NVIDIA_API_KEY) {
    return new ConfigError("Missing NVIDIA_MODEL in ~/.session-digests/.env.");
  }

  return new ConfigError("Missing provider credentials in ~/.session-digests/.env.");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
