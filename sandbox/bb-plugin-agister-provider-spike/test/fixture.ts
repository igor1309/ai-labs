import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// A throwaway Agister home holding only the bash agent, and a git worktree
// whose repository layer (`.agister`, ADR-002) defines the workflow
// "bb_spike" as one bash step. No model runs anywhere.
//
// The step writes its pid to `step.pid`; on the prompt "hold" it becomes a
// five-minute sleep, the long-running step a stop must end. It also prints
// whether ANTHROPIC_API_KEY reached it.
const STEP_SCRIPT = `echo $$ > step.pid
if [ "$prompt" = "hold" ]; then exec sleep 300; fi
printf 'agister bash step got: %s\\n' "$prompt"
printf 'ANTHROPIC_API_KEY=%s\\n' "\${ANTHROPIC_API_KEY-unset}"
`;

const FILES: Record<string, string> = {
  "home/service.toml": `schema = "agister.service/v1alpha1"
max_timeout = "1h"
max_attempts = 1
max_verify_attempts = 3
permissions = ["repository.read", "repository.search", "repository.diff", "repository.history.read", "repository.write", "repository.history.write", "process.execute", "network", "host.read", "host.write"]
writing = ["repository.write", "repository.history.write"]
state_reaching = []
`,
  "home/agents/bash.toml": `schema = "agister.agent/v1alpha1"
runtime = "bash"
`,
  "home/runtimes/bash.yaml": `schema: agister.runtime/v1alpha1
adapter: bash
contract: bash/1
grants: [repository.read, repository.search, repository.diff, repository.history.read, repository.write, repository.history.write, process.execute, network, host.read, host.write]
`,
  "repo/.agister/processes/bb_spike_say.yaml": `schema: agister.process/v1alpha1
prompt: bb_spike_say
params:
  prompt: {}
inputs:
  prompt: {source: param, name: prompt}
`,
  "repo/.agister/prompts/bb_spike_say.md": STEP_SCRIPT,
  "repo/.agister/workflows/bb_spike.yaml": `schema: agister.workflow/v1alpha1
params:
  prompt: {}
steps:
  - {name: say, process: bb_spike_say, agent: bash, inputs: {prompt: {from: params.prompt}}}
outputs:
  said: {from: steps.say.outputs.stdout.head}
`,
};

export interface Fixture {
  root: string;
  home: string;
  repo: string;
  stepPid(): number | null;
  record(runId: string): { status: string; result: { class: string | null } | null };
  cleanup(): void;
}

export function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "bb-agister-spike-"));
  for (const [path, text] of Object.entries(FILES)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  const repo = join(root, "repo");
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=spike@example.invalid", "-c", "user.name=spike", ...args], { cwd: repo, stdio: "ignore" });
  git("init", "-q");
  git("add", ".agister/processes/bb_spike_say.yaml", ".agister/prompts/bb_spike_say.md", ".agister/workflows/bb_spike.yaml");
  git("commit", "-qm", "fixture");
  const home = join(root, "home");
  return {
    root,
    home,
    repo,
    stepPid() {
      try {
        // The step may not have finished writing the file yet.
        const pid = Number(readFileSync(join(repo, "step.pid"), "utf8").trim());
        return Number.isInteger(pid) && pid > 0 ? pid : null;
      } catch {
        return null;
      }
    },
    record(runId) {
      return JSON.parse(readFileSync(join(home, "runs", runId, "record.json"), "utf8"));
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
