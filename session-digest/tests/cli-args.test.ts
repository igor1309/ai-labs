import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import { main } from "../src/cli.js";

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
