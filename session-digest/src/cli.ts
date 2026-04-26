import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Writable } from "node:stream";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { AgentError, buildAgent, defaultNimModel, loadPromptTemplates, run } from "./agents.js";
import { defaultClock } from "./clock.js";
import { ConfigError, loadConfig } from "./config.js";
import { InputError, parseSession, validateInputPath } from "./inputs.js";
import { assembleDigest, computeDigestPath, writeDigest } from "./output.js";

export type MainDeps = {
  clock?: () => Date;
  baseDir?: string;
  fsLike?: Pick<typeof fs.promises, "stat" | "readFile" | "writeFile" | "mkdir">;
  model?: BaseChatModel;
};

export async function main(
  argv: string[],
  stdout: Writable,
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

  try {
    await validateInputPath(argv[0], fsLike);
    const messages = await parseSession(argv[0], fsLike);
    await fsLike.mkdir(baseDir, { recursive: true });
    const config = await loadConfig(baseDir, fsLike);
    const nowUtc = clock();
    const model = deps.model ?? defaultNimModel(config);
    const prompts = await loadPromptTemplates(fsLike.readFile);
    const agent = buildAgent({ model, prompts });
    const sections = await run(messages, agent);
    const digestPath = computeDigestPath(argv[0], nowUtc, baseDir);
    const digest = assembleDigest({
      title: "Session Digest",
      source_path: argv[0],
      provider: "nvidia_nim",
      model: config.model,
      generated_at: nowUtc,
    }, sections);

    await writeDigest(digestPath, digest, fsLike);
    stdout.write(`${digestPath}\n`);
  } catch (error) {
    if (error instanceof InputError || error instanceof ConfigError || error instanceof AgentError) {
      stderr.write(`${error.message}\n`);

      return 1;
    }

    if (error instanceof Error) {
      stderr.write(`${error.message}\n`);

      return 1;
    }

    throw error;
  }

  return 0;
}
