import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  SPIKE_MODEL,
  SPIKE_PROVIDER_ID,
  spikeExtensionKinds,
} from "./src/vocabulary.js";

export default function plugin(bb: BbPluginApi) {
  bb.providers.register({
    id: SPIKE_PROVIDER_ID,
    displayName: "Agister (spike)",
    icon: "Workflow",
    strings: {
      signInHint:
        "Agister signs in through its own runtimes; run `agister check` on the machine.",
      expiredHint:
        "Agister's runtime sessions are Agister's; run `agister check` on the machine.",
      installUrl:
        "https://github.com/igor1309/ai-labs/tree/trunk/agister",
    },
    maintenance: { health: false, usage: false, installation: false },
    capabilities: {
      supportsServiceTier: false,
      supportsNativeUserQuestion: false,
      fork: "none",
      supportsManualCompaction: false,
      supportsThreadArchive: false,
      supportsThreadRename: false,
      // Agister's own permission plan decides what a step may do; bb's
      // approval modes have nothing to approve.
      permissionModes: ["full"],
      reasoningLevels: ["medium"],
    },
    reasoningLevels: [{ id: "medium", label: "Agister decides" }],
    composerActions: [],
    completedTurnDisplay: "flat",
    models: { fallback: [SPIKE_MODEL] },
    extensionKinds: spikeExtensionKinds,
  });
}
