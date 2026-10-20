import { createAgisterBridge } from "../src/bridge.js";

export interface Message {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown> & { deltas?: Array<Record<string, unknown>> };
  result?: unknown;
  error?: { code: number; message: string };
}

// A runtime stand-in: sends lines to a bridge built with the given env and
// keeps every line it writes, in order.
export function createClient(env: NodeJS.ProcessEnv) {
  const messages: Message[] = [];
  let unread = 0;
  const exits: number[] = [];
  const bridge = createAgisterBridge({
    env,
    write: (line) => {
      for (const part of line.split("\n")) {
        if (part.trim() !== "") messages.push(JSON.parse(part));
      }
    },
    exit: (code) => exits.push(code),
  });
  let nextId = 0;
  return {
    bridge,
    messages,
    exits,
    // For the conformance kit: every message written since the last take.
    takeMessages(): unknown[] {
      const taken = messages.slice(unread);
      unread = messages.length;
      return taken;
    },
    request(method: string, params: Record<string, unknown>): string {
      nextId += 1;
      const id = `t-${nextId}`;
      bridge.handleLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      return id;
    },
    deltas(threadId: string): Array<Record<string, unknown>> {
      return messages
        .filter((m) => m.method === "thread/delta" && m.params?.threadId === threadId)
        .flatMap((m) => m.params?.deltas ?? []);
    },
    indexOf(predicate: (m: Message) => boolean): number {
      return messages.findIndex(predicate);
    },
    // Waits until the probe returns something other than undefined, null or
    // false. Probes that can return 0 or "" must return a boolean instead.
    async waitFor<T>(probe: () => T | undefined | null | false, timeoutMs = 15_000): Promise<T> {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const value = probe();
        if (value !== undefined && value !== null && value !== false) return value;
        if (Date.now() > until) throw new Error("timed out waiting");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
  };
}

// The execution options the conformance kit sends.
export const OPTIONS = {
  permissionMode: "full",
  permissionScope: "full",
  approvalReviewer: null,
  permissionEscalation: null,
};
