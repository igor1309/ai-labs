import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createDemoReviewFixPolicy,
  runDemo,
} from "../examples/local-demo/run-demo.js";
import {
  AGENTS_YAML_EXAMPLE,
  MODELS_YAML_EXAMPLE,
} from "../src/settings/example-bootstrap.js";
import { makeSettingsWorkspace } from "./helpers/settings.js";

const DEMO_DIRECTORY = join("regentara", "examples", "local-demo");

test("local demo settings should match bootstrap examples", async () => {
  const agentsYaml = await readTextOrNull(join(DEMO_DIRECTORY, "agents.yaml"));
  const workspaceAgentsYaml = await readTextOrNull(join(DEMO_DIRECTORY, ".regentara", "agents.yaml"));
  const modelsYaml = await readTextOrNull(join(DEMO_DIRECTORY, "models.yaml"));
  const workspaceModelsYaml = await readTextOrNull(join(DEMO_DIRECTORY, ".regentara", "models.yaml"));

  assert.deepEqual(
    { agentsYaml, modelsYaml, workspaceAgentsYaml, workspaceModelsYaml },
    {
      agentsYaml: AGENTS_YAML_EXAMPLE,
      modelsYaml: MODELS_YAML_EXAMPLE,
      workspaceAgentsYaml: AGENTS_YAML_EXAMPLE,
      workspaceModelsYaml: MODELS_YAML_EXAMPLE,
    },
  );
});

test("runDemo should complete with injected fake provider execution and fake CLI availability", async () => {
  const workspace = await makeSettingsWorkspace();
  const agentIds = [];
  const checkedCommands = [];

  const result = await runDemo({
    artifactExists: async () => true,
    commandExists: async (command) => {
      checkedCommands.push(command);
      return true;
    },
    executeProviderCli: async (input) => {
      agentIds.push(input.agentId);
      if (input.agentId === "reviewer") {
        return { exitStatus: 0, semanticResult: { verdict: "accepted" } };
      }

      return { exitStatus: 0, semanticResult: { artifact: "producer/result.json" } };
    },
    homeDirectory: workspace.homeDirectory,
  });

  assert.deepEqual(
    { agentIds, checkedCommands, status: result.status },
    { agentIds: ["producer", "reviewer"], checkedCommands: ["claude"], status: "succeeded" },
  );
});

test("local demo README should document the smoke command with front matter", async () => {
  const readme = await readTextOrNull(join(DEMO_DIRECTORY, "README.md"));

  assert.equal(
    readme?.startsWith("---\ndate: 2026-04-28\nmodel: gpt-5\ndescription:"),
    true,
  );
  assert.match(readme ?? "", /node regentara\/examples\/local-demo\/run-demo\.js/);
});

test("createDemoReviewFixPolicy should remediate rejected reviews until the budget is exhausted", async () => {
  const policy = createDemoReviewFixPolicy({ maxRemediations: 1 });
  const firstDecision = await policy.decide({ verdict: { verdict: "rejected" } });
  const secondDecision = await policy.decide({
    session: firstDecision.session,
    verdict: { verdict: "rejected" },
  });

  assert.deepEqual(
    { firstDecision, secondDecision },
    {
      firstDecision: { decision: "remediate", session: { remediationCount: 1 } },
      secondDecision: { decision: "complete-fail", session: { remediationCount: 1 } },
    },
  );
});

test("createDemoReviewFixPolicy should complete ok for accepted reviews", async () => {
  const policy = createDemoReviewFixPolicy();

  const decision = await policy.decide({ verdict: { verdict: "accepted" } });

  assert.deepEqual(decision, { decision: "complete-ok", session: undefined });
});

async function readTextOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
