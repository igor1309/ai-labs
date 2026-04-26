import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import test from "node:test";

type LoadConfig = (
  baseDir: string,
  fsLike: {
    readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
    writeFile: (path: string, data: string, options: { flag: string }) => Promise<void>;
  },
) => Promise<unknown>;

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

test("test_missing_env_creates_env_example_via_injected_fs_writefile", async () => {
  const baseDir = "/tmp/session-digests";
  const writeFileCalls: Array<{ path: string; data: string; options: { flag: string } }> = [];
  const { loadConfig } = await loadConfigModule();
  const fsLike = {
    readFile: async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    writeFile: async (calledPath: string, data: string, options: { flag: string }) => {
      writeFileCalls.push({ path: calledPath, data, options });
    },
  };

  await assert.rejects(
    () => loadConfig(baseDir, fsLike),
    (error: unknown) => error instanceof Error && error.message.includes(".env.example"),
  );
  assert.deepEqual(writeFileCalls, [{
    path: path.join(baseDir, ".env.example"),
    data: envExampleBody,
    options: { flag: "wx" },
  }]);
});

test("test_missing_env_with_existing_env_example_does_not_overwrite_and_emits_same_error", async () => {
  const baseDir = "/tmp/session-digests";
  const writeFileCalls: Array<{ path: string; data: string; options: { flag: string } }> = [];
  const { loadConfig } = await loadConfigModule();
  const fsLike = {
    readFile: async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    writeFile: async (calledPath: string, data: string, options: { flag: string }) => {
      writeFileCalls.push({ path: calledPath, data, options });
      throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    },
  };

  await assert.rejects(
    () => loadConfig(baseDir, fsLike),
    (error: unknown) => error instanceof Error && error.message.includes(".env.example"),
  );
  assert.deepEqual(writeFileCalls, [{
    path: path.join(baseDir, ".env.example"),
    data: envExampleBody,
    options: { flag: "wx" },
  }]);
});

test("test_missing_api_key_returns_error", async () => {
  const { loadConfig } = await loadConfigModule();
  const fsLike = makeReadOnlyFsLike("NVIDIA_MODEL=foo\n");

  await assert.rejects(
    () => loadConfig("/tmp/session-digests", fsLike),
    (error: unknown) => error instanceof Error && error.message.includes("NVIDIA_API_KEY"),
  );
});

test("test_load_config_returns_openrouter_config_when_openrouter_keys_exist", async () => {
  const { loadConfig } = await loadConfigModule();
  const fsLike = makeReadOnlyFsLike("OPENROUTER_API_KEY=or-key\nOPENROUTER_MODEL=x-ai/grok-4.1-fast\n");

  const config = await loadConfig("/tmp/session-digests", fsLike);

  assert.deepEqual(config, {
    apiKey: "or-key",
    baseURL: "https://openrouter.ai/api/v1",
    model: "x-ai/grok-4.1-fast",
    provider: "openrouter",
  });
});

test("test_load_config_returns_nomos_config_when_nomos_keys_exist", async () => {
  const { loadConfig } = await loadConfigModule();
  const fsLike = makeReadOnlyFsLike("NOMOS_API_KEY=nomos-key\nNOMOS_MODEL=deepseek/deepseek-v3.2\nNOMOS_BASE_URL=http://127.0.0.1:8080/v1\n");

  const config = await loadConfig("/tmp/session-digests", fsLike);

  assert.deepEqual(config, {
    apiKey: "nomos-key",
    baseURL: "http://127.0.0.1:8080/v1",
    model: "deepseek/deepseek-v3.2",
    provider: "nomos",
  });
});

test("test_load_config_prefers_nomos_when_nomos_and_openrouter_keys_exist", async () => {
  const { loadConfig } = await loadConfigModule();
  const fsLike = makeReadOnlyFsLike([
    "OPENROUTER_API_KEY=or-key",
    "OPENROUTER_MODEL=x-ai/grok-4.1-fast",
    "NOMOS_API_KEY=nomos-key",
    "NOMOS_MODEL=deepseek/deepseek-v3.2",
  ].join("\n"));

  const config = await loadConfig("/tmp/session-digests", fsLike);

  assert.deepEqual(config, {
    apiKey: "nomos-key",
    baseURL: "http://localhost:8080/v1",
    model: "deepseek/deepseek-v3.2",
    provider: "nomos",
  });
});

test("test_missing_model_returns_error", async () => {
  const { loadConfig } = await loadConfigModule();
  const fsLike = makeReadOnlyFsLike("NVIDIA_API_KEY=k\n");

  await assert.rejects(
    () => loadConfig("/tmp/session-digests", fsLike),
    (error: unknown) => error instanceof Error && error.message.includes("NVIDIA_MODEL"),
  );
});

test("test_load_config_eacces_on_env_read_returns_config_error", async () => {
  const baseDir = "/tmp/session-digests";
  const readFileCalls: string[] = [];
  const writeFileCalls: string[] = [];
  const { loadConfig } = await loadConfigModule();
  const fsLike = {
    readFile: async (calledPath: string) => {
      readFileCalls.push(calledPath);
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    },
    writeFile: async (calledPath: string) => {
      writeFileCalls.push(calledPath);
    },
  } as Parameters<LoadConfig>[1];

  await assert.rejects(
    () => loadConfig(baseDir, fsLike),
    (error: unknown) => error instanceof Error && /permission/i.test(error.message),
  );
  assert.deepEqual(readFileCalls, [path.join(baseDir, ".env")]);
  assert.deepEqual(writeFileCalls, []);
});

test("test_load_config_invokes_injected_fs_read_file_on_happy_path", async () => {
  const baseDir = "/tmp/session-digests";
  const readFileCalls: Array<{ path: string; encoding: BufferEncoding }> = [];
  const { loadConfig } = await loadConfigModule();
  const fsLike = {
    readFile: async (calledPath: string, encoding: BufferEncoding) => {
      readFileCalls.push({ path: calledPath, encoding });

      return "NVIDIA_API_KEY=k\nNVIDIA_MODEL=m\n";
    },
    writeFile: async () => {},
  } as Parameters<LoadConfig>[1];

  const config = await loadConfig(baseDir, fsLike);

  assert.deepEqual(config, {
    apiKey: "k",
    baseURL: "https://integrate.api.nvidia.com/v1",
    model: "m",
    provider: "nvidia_nim",
  });
  assert.deepEqual(readFileCalls, [{ path: path.join(baseDir, ".env"), encoding: "utf8" }]);
});

test("test_load_config_does_not_mutate_process_env", async () => {
  const apiKey = `key-${randomUUID()}`;
  const { loadConfig } = await loadConfigModule();

  await loadConfig("/tmp/session-digests", makeReadOnlyFsLike(`NVIDIA_API_KEY=${apiKey}\nNVIDIA_MODEL=m\n`));

  assert.notEqual(process.env.NVIDIA_API_KEY, apiKey);
});

async function loadConfigModule(): Promise<{ loadConfig: LoadConfig }> {
  const config = await import("../src/config.js")
    .catch(() => ({})) as Partial<{ loadConfig: LoadConfig }>;

  return {
    loadConfig: config.loadConfig ?? (async () => undefined),
  };
}

function makeReadOnlyFsLike(contents: string): Parameters<LoadConfig>[1] {
  return {
    readFile: async () => contents,
    writeFile: async () => {},
  };
}
