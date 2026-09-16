import type { RegistryState, RegistryStates } from "./claude-code-registry.js";
import type { RuntimeState, RuntimeStates } from "./claude-code.js";

const runtimeStateOf: Record<RegistryState, RuntimeState> = {
  working: "working",
  waiting: "waiting",
  idle: "idle",
};

export function composeClaudeCodeRuntimeStates(registryStates: RegistryStates): RuntimeStates {
  return () => {
    const registered = registryStates();

    return (sessionId) => {
      const state = registered(sessionId);

      return state === undefined ? undefined : runtimeStateOf[state];
    };
  };
}
