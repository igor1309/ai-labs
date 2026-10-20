import type { PluginProviderFallbackModel } from "@get-bb/plugin-sdk";
import { z } from "zod";

// The plugin id bb derives from the package name "bb-plugin-<id>".
export const SPIKE_PLUGIN_ID = "agister-provider-spike";

export const SPIKE_PROVIDER_ID = "agister-spike";

// The one workflow this provider runs and the one param the prompt fills.
// Both are fixed here: nothing in a prompt, a setting or a thread option
// can name another workflow, another param, or another executable.
export const AGISTER_EXECUTABLE = "agister";
export const AGISTER_WORKFLOW = "bb_spike";
export const AGISTER_PROMPT_PARAM = "prompt";

export const SPIKE_MODEL_ID = `agister/${AGISTER_WORKFLOW}`;

export const SPIKE_MODEL = {
  id: SPIKE_MODEL_ID,
  displayName: `Agister · ${AGISTER_WORKFLOW}`,
  description: `Runs the Agister workflow "${AGISTER_WORKFLOW}" in the thread's worktree.`,
  supportedReasoningEfforts: [
    { reasoningEffort: "medium", description: "Agister's settings decide" },
  ],
  defaultReasoningEffort: "medium",
  isDefault: true,
} satisfies PluginProviderFallbackModel;

// The thread's latest Agister run, as Agister reported it. A pointer into
// Agister's own record, not a copy of it.
export const RUN_STATE_KIND = `${SPIKE_PLUGIN_ID}/run` as const;

export const runStateSchema = z.object({
  runId: z.string().nullable(),
  status: z.string(),
  class: z.string().nullable(),
  workflow: z.string(),
  recordPath: z.string().nullable(),
});
export type RunState = z.infer<typeof runStateSchema>;

export const spikeExtensionKinds = {
  run: { state: runStateSchema },
} as const;
