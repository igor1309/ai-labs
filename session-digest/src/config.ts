import type * as fs from "node:fs";
import * as path from "node:path";

import { parse } from "dotenv";

export type Config = {
  apiKey: string;
  baseURL: string;
  digestSchemaPath?: string;
  model: string;
  provider: string;
};

export type Settings = {
  modelContextMaxBytes?: number;
};

export type ConfigFs = Pick<typeof fs.promises, "readFile" | "writeFile">;
export type SettingsFs = Pick<typeof fs.promises, "readFile">;

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
  "# Optional digest schema",
  "SESSION_DIGEST_SCHEMA_PATH=",
  "",
].join("\n");

export class ConfigError extends Error {}

export async function loadSettings(
  baseDir: string,
  fsLike: SettingsFs,
  environment: Record<string, string | undefined> = process.env,
): Promise<Settings> {
  let settingsBody: string;

  try {
    settingsBody = await fsLike.readFile(path.join(baseDir, "settings.env"), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return settingsWithEnvironmentOverrides({}, environment);
    }

    if (isNodeError(error) && error.code === "EACCES") {
      throw new ConfigError("Cannot read ~/.session-digests/settings.env: permission denied.");
    }

    throw error;
  }

  return settingsWithEnvironmentOverrides(settingsFromParsed(parse(settingsBody)), environment);
}

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
  const config = nomosConfig(parsed) ?? openRouterConfig(parsed) ?? nvidiaConfig(parsed);

  if (config) {
    return configWithDigestSchemaPath(config, parsed);
  }

  throw missingConfigError(parsed);
}

function configWithDigestSchemaPath(config: Config, parsed: Record<string, string>): Config {
  const digestSchemaPath = parsed.SESSION_DIGEST_SCHEMA_PATH?.trim();

  return hasValue(digestSchemaPath) ? { ...config, digestSchemaPath } : config;
}

function settingsFromParsed(parsed: Record<string, string>): Settings {
  const modelContextMaxBytes = parsed.MODEL_CONTEXT_MAX_BYTES?.trim();

  return hasValue(modelContextMaxBytes)
    ? { modelContextMaxBytes: positiveIntegerSetting("MODEL_CONTEXT_MAX_BYTES", modelContextMaxBytes) }
    : {};
}

function settingsWithEnvironmentOverrides(
  settings: Settings,
  environment: Record<string, string | undefined>,
): Settings {
  const modelContextMaxBytes = environment.SESSION_DIGEST_MODEL_CONTEXT_MAX_BYTES?.trim();

  return hasValue(modelContextMaxBytes)
    ? {
      ...settings,
      modelContextMaxBytes: positiveIntegerSetting(
        "SESSION_DIGEST_MODEL_CONTEXT_MAX_BYTES",
        modelContextMaxBytes,
      ),
    }
    : settings;
}

function positiveIntegerSetting(name: string, value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} must be a positive integer.`);
  }

  return parsed;
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
  if (!isCompletePair(config.apiKey, config.model)) {
    return undefined;
  }

  return {
    ...config,
    apiKey: config.apiKey.trim(),
    baseURL: trimTrailingSlash(config.baseURL),
    model: config.model.trim(),
  };
}

function missingConfigError(parsed: Record<string, string>): ConfigError {
  if (hasValue(parsed.OPENROUTER_MODEL)) {
    return new ConfigError("Missing OPENROUTER_API_KEY in ~/.session-digests/.env.");
  }

  if (hasValue(parsed.OPENROUTER_API_KEY)) {
    return new ConfigError("Missing OPENROUTER_MODEL in ~/.session-digests/.env.");
  }

  if (hasValue(parsed.NOMOS_MODEL)) {
    return new ConfigError("Missing NOMOS_API_KEY in ~/.session-digests/.env.");
  }

  if (hasValue(parsed.NOMOS_API_KEY)) {
    return new ConfigError("Missing NOMOS_MODEL in ~/.session-digests/.env.");
  }

  if (hasValue(parsed.NVIDIA_MODEL)) {
    return new ConfigError("Missing NVIDIA_API_KEY in ~/.session-digests/.env.");
  }

  if (hasValue(parsed.NVIDIA_API_KEY)) {
    return new ConfigError("Missing NVIDIA_MODEL in ~/.session-digests/.env.");
  }

  return new ConfigError("Missing provider credentials in ~/.session-digests/.env.");
}

function isCompletePair(apiKey: string, model: string): boolean {
  return hasValue(apiKey) && hasValue(model);
}

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
