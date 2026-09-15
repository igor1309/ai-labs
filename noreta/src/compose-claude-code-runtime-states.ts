import type { RegistryState, RegistryStates } from "./claude-code-registry.js";
import type { RuntimeStates, SessionStatus } from "./claude-code.js";

// The registry names the states it can read off disk, and the adapter names the
// states it accepts. This is the only place the two vocabularies meet. They
// agree word for word today, so the table detects nothing; what it buys is the
// freedom to translate, written out in one place rather than assumed everywhere.
// That freedom runs one way. The registry can rename or split a state without
// the adapter following, because this table absorbs it. The adapter's statuses
// are not free that way: they are words the list knows — `RuntimeState` in
// `sessions.ts` — so renaming one is a change to that union, and splitting one
// asks for a status the registry has no way to tell apart.
//
// Exhaustive over the registry's states by its type, so a state added there has
// to be given a status here before the build passes.
const statusOf: Record<RegistryState, SessionStatus> = {
  working: "working",
  waiting: "waiting",
  idle: "idle",
};

// Composition: the registry's read becomes the adapter's port. The snapshot is
// taken from the registry once per read and asked about each session, which is
// what the adapter's port promises its callers.
export function composeClaudeCodeRuntimeStates(registryStates: RegistryStates): RuntimeStates {
  return () => {
    const registered = registryStates();

    return (sessionId) => {
      // A session the registry holds nothing for stays unanswered for: the
      // adapter reads that as not running.
      const state = registered(sessionId);

      return state === undefined ? undefined : statusOf[state];
    };
  };
}
