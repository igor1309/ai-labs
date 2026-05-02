import { RuntimeFailure } from "../errors.js";

export function createConfigBasedReviewFixPolicy(settings) {
  const maxRemediationAttempts = settings.reviewPolicy.maxRemediationAttempts;

  return {
    decide: async ({ session, verdict }) => {
      if (typeof verdict?.verdict !== "string" || verdict.verdict.trim() === "") {
        throw new RuntimeFailure("review verdict must define a non-empty string verdict");
      }

      if (verdict.verdict === "accepted" && verdict.verification?.ran === true) {
        return {
          decision: "complete-ok",
          maxRemediationAttempts,
          session,
          terminalArtifact: {
            content: "# Terminal Decision\n\nThe reviewer accepted the result after verification ran.\n",
          },
        };
      }

      if (verdict.verification?.ran !== true) {
        return {
          decision: "complete-fail",
          maxRemediationAttempts,
          reason: "reviewer reported verification did not run",
          session,
          terminalArtifact: {
            content: "# Terminal Decision\n\nThe run failed because the reviewer reported that verification did not run.\n",
          },
        };
      }

      const remediationAttempts = session?.remediationAttempts ?? 0;
      if (remediationAttempts >= maxRemediationAttempts) {
        return {
          decision: "complete-fail",
          maxRemediationAttempts,
          session,
          terminalArtifact: {
            content: `# Terminal Decision\n\nThe run failed because the remediation budget was exhausted after ${formatRemediationAttempts(maxRemediationAttempts)}.\n`,
          },
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

function formatRemediationAttempts(count) {
  return `${count} remediation ${count === 1 ? "attempt" : "attempts"}`;
}
