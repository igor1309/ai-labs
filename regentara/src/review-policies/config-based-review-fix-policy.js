import { RuntimeFailure } from "../errors.js";

export function createConfigBasedReviewFixPolicy(settings) {
  const maxRemediationAttempts = settings.reviewPolicy.maxRemediationAttempts;

  return {
    decide: async ({ session, verdict }) => {
      if (typeof verdict?.verdict !== "string" || verdict.verdict.trim() === "") {
        throw new RuntimeFailure("review verdict must define a non-empty string verdict");
      }

      if (verdict.verdict === "accepted") {
        return {
          decision: "complete-ok",
          maxRemediationAttempts,
          session,
        };
      }

      const remediationAttempts = session?.remediationAttempts ?? 0;
      if (remediationAttempts >= maxRemediationAttempts) {
        return {
          decision: "complete-fail",
          maxRemediationAttempts,
          session,
        };
      }

      return {
        decision: "remediate",
        maxRemediationAttempts,
        session: {
          remediationAttempts: remediationAttempts + 1,
        },
      };
    },
  };
}
