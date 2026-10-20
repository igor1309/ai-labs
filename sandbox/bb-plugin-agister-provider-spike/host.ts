import { experimental_defineProviderBridge } from "@get-bb/plugin-sdk/provider-bridge";
import { createAgisterBridge } from "./src/bridge.js";

// Importing this module starts nothing: the bridge object is built on the
// first call the daemon's bootstrap makes.
let bridge: ReturnType<typeof createAgisterBridge> | null = null;
function current() {
  bridge ??= createAgisterBridge({ env: process.env });
  return bridge;
}

export const experimental_providerBridge = experimental_defineProviderBridge({
  handleLine: (line) => current().handleLine(line),
  onSigterm: () => void current().shutdown(),
  onSigint: () => void current().shutdown(),
  onClose: () => void current().shutdown(),
});
