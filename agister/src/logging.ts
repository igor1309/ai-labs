import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Diagnostic logging: how Agister's own plumbing behaved (calls, timings,
// failures). It is applied by decorators the composition root wraps around
// ports, so core modules never import a logger.
//
// Logging is not the run record. Anything needed to understand a run belongs
// in its events or its outcome reason, which are always written; logs may be
// filtered, rotated or disabled without losing run evidence.

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFields = Record<string, unknown>;

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
}

export const nullLogger: Logger = { log: () => {} };

// Correlation fields (e.g. the run ID) for everything logged inside `body`,
// including from decorators deep in the call stack.
const context = new AsyncLocalStorage<LogFields>();

export function withLogContext<T>(fields: LogFields, body: () => Promise<T>): Promise<T> {
  return context.run({ ...context.getStore(), ...fields }, body);
}

export interface JsonlLoggerOptions {
  minLevel?: LogLevel;
  now?: () => Date;
}

export function jsonlLogger(write: (line: string) => void, options: JsonlLoggerOptions = {}): Logger {
  const threshold = LOG_LEVELS.indexOf(options.minLevel ?? "info");
  const now = options.now ?? (() => new Date());
  return {
    log(level, message, fields = {}) {
      if (LOG_LEVELS.indexOf(level) < threshold) return;
      try {
        write(JSON.stringify({ at: now().toISOString(), level, message, ...context.getStore(), ...fields }));
      } catch {
        // Logging must never break the work it observes.
      }
    },
  };
}

export function fileSink(path: string): (line: string) => void {
  let ready = false;
  return (line) => {
    if (!ready) {
      mkdirSync(dirname(path), { recursive: true });
      ready = true;
    }
    appendFileSync(path, line + "\n");
  };
}

export function teeLogger(...loggers: Logger[]): Logger {
  return { log: (level, message, fields) => loggers.forEach((logger) => logger.log(level, message, fields)) };
}
