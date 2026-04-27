import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { main } from "../src/cli.js";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test("test_main_exits_nonzero_when_no_positional_arg", async () => {
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([], stdout, stderr);

  assert.notEqual(exitCode, 0);
  assert.notEqual(stderr.toString(), "");
});

test("test_main_exits_nonzero_when_more_than_one_positional_arg", async () => {
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main(["first.jsonl", "second.jsonl"], stdout, stderr);

  assert.notEqual(exitCode, 0);
  assert.notEqual(stderr.toString(), "");
});

test("test_main_exits_nonzero_when_any_flag_is_passed", async () => {
  const cases = [["--help"], ["-h"]];

  for (const argv of cases) {
    const stdout = new StringSink();
    const stderr = new StringSink();

    const exitCode = await main(argv, stdout, stderr);

    assert.notEqual(exitCode, 0);
    assert.notEqual(stderr.toString(), "");
  }
});

test("test_main_exits_nonzero_when_double_dash_reserved_token_is_passed", async () => {
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main(["--"], stdout, stderr);

  assert.notEqual(exitCode, 0);
  assert.notEqual(stderr.toString(), "");
});

test("test_cli_script_shouldInvokeMain_onDirectExecution", async () => {
  const result = await execFileResult(process.execPath, ["--import", "tsx", cliPath]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Expected exactly one session JSONL path\./);
});

async function execFileResult(command: string, args: string[]): Promise<{ code: number; stderr: string }> {
  try {
    await execFileAsync(command, args);

    return { code: 0, stderr: "" };
  } catch (error) {
    if (isExecError(error)) {
      return { code: error.code ?? 1, stderr: error.stderr };
    }

    throw error;
  }
}

function isExecError(error: unknown): error is { code?: number; stderr: string } {
  return typeof error === "object"
    && error !== null
    && "stderr" in error
    && typeof error.stderr === "string";
}

class StringSink extends Writable {
  readonly chunks: string[] = [];

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  override toString(): string {
    return this.chunks.join("");
  }
}
