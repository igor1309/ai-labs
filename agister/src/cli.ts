import { composeAgister } from "./composition-root.js";
import { main } from "./main.js";

// Process entry point: real I/O, signal handling and the composition root.

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// A closed pipe (e.g. `agister runs | head`) ends output, not the process with a trace.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(process.exitCode ?? 0);
    throw error;
  });
}

const controller = new AbortController();
process.on("SIGINT", () => {
  if (controller.signal.aborted) process.exit(130);
  controller.abort();
});

process.exitCode = await main(
  process.argv.slice(2),
  {
    cwd: process.cwd(),
    env: process.env,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    stdin: readStdin,
    signal: controller.signal,
  },
  composeAgister,
);
