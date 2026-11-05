// A canned session: given its state and an action by meaning, it returns
// content, the actions now available and its updated state. No brain, no Agonara.
const ACTIONS = [
  { id: "explain_simpler", label: "Explain simpler" },
  { id: "dive_deeper", label: "Dive deeper" },
  { id: "long_reply", label: "Long reply" },
  { id: "reset", label: "Start over" },
];

const contentFor = {
  explain_simpler: (s) => `Simpler explanation (depth ${s.depth}).`,
  dive_deeper: (s) => `Deeper explanation (depth ${s.depth}).`,
  long_reply: () => {
    const lines = Array.from({ length: 300 }, (_, i) => `Line ${i + 1} of the long reply.`);
    return [...lines, "END OF LONG REPLY"].join("\n");
  },
  reset: () => "Session restarted.",
};

export function initialSession() {
  return { step: 0, depth: 0, lastContent: "Session started." };
}

export function view(session) {
  return { content: `${session.lastContent}\n\nStep ${session.step}.`, actions: ACTIONS };
}

export function applyAction(session, actionId) {
  const content = contentFor[actionId];
  if (!content) return null;
  const depth =
    actionId === "reset" ? 0 :
    actionId === "dive_deeper" ? session.depth + 1 :
    actionId === "explain_simpler" ? Math.max(0, session.depth - 1) :
    session.depth;
  const next = { step: session.step + 1, depth };
  return { ...next, lastContent: content(next) };
}
