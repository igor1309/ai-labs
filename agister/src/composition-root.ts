import { join } from "node:path";

import { createAgister, type Agister, type RuntimeCatalog, type RuntimeProvider } from "./application.js";
import { CLAUDE_EFFORTS, claudeCodeAdapter } from "./claude-code.js";
import { CODEX_EFFORTS, codexAdapter } from "./codex.js";
import { withLogging } from "./logged-runtime.js";
import { fileSink, jsonlLogger, teeLogger, withLogContext, type Logger } from "./logging.js";

// The only module that knows which runtimes exist. It instantiates the
// concrete adapters, decorates each with the cross-cutting concerns
// (logging), and hands the application a runtime-agnostic catalog.

export interface CompositionConfig {
  stateDirectory: string;
  // Also write debug-level diagnostics here (the CLI passes stderr for --debug).
  debug?: (line: string) => void;
}

export function composeAgister(config: CompositionConfig): Agister {
  const logger = composeLogger(config);

  const providers: RuntimeProvider[] = [
    {
      runtime: "claude-code",
      efforts: CLAUDE_EFFORTS,
      create: (options) => withLogging(claudeCodeAdapter(options), logger),
    },
    {
      runtime: "codex",
      efforts: CODEX_EFFORTS,
      create: (options) => withLogging(codexAdapter(options), logger),
    },
  ];
  const runtimes: RuntimeCatalog = new Map(providers.map((provider) => [provider.runtime, provider]));

  return createAgister({ stateDirectory: config.stateDirectory, runtimes, scope: withLogContext });
}

export function logPath(stateDirectory: string): string {
  return join(stateDirectory, "logs", "agister.jsonl");
}

function composeLogger(config: CompositionConfig): Logger {
  const file = jsonlLogger(fileSink(logPath(config.stateDirectory)), { minLevel: config.debug ? "debug" : "info" });
  return config.debug ? teeLogger(file, jsonlLogger(config.debug, { minLevel: "debug" })) : file;
}
