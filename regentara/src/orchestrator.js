export class ReviewFixPolicy {
  async decide() {
    return {
      decision: "complete-fail",
      session: undefined,
    };
  }
}

export async function runWorkflow() {
  return {
    status: "failed",
    exitCode: 1,
    failureReason: "not implemented",
  };
}
