import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeFailure } from "../src/errors.js";
import { createConfigBasedReviewFixPolicy } from "../src/review-policies/config-based-review-fix-policy.js";

test("ConfigBasedReviewFixPolicy.decide should return complete-ok when verdict is accepted and verification ran", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "accepted", verification: { ran: true } },
  });

  assert.equal(decision.decision, "complete-ok");
});

test("ConfigBasedReviewFixPolicy.decide should return terminal artifact when verdict is accepted and verification ran", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "accepted", verification: { ran: true } },
  });

  assert.equal(
    decision.terminalArtifact?.content,
    "# Terminal Decision\n\nThe reviewer accepted the result after verification ran.\n",
  );
});

test("ConfigBasedReviewFixPolicy.decide should refuse complete-ok when verdict is accepted but verification did not run", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "accepted", verification: { ran: false } },
  });

  assert.notEqual(decision.decision, "complete-ok");
});

test("ConfigBasedReviewFixPolicy.decide should refuse complete-ok when verdict is accepted but verification field is missing", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "accepted" },
  });

  assert.notEqual(decision.decision, "complete-ok");
});

test("ConfigBasedReviewFixPolicy.decide should complete-fail an unverified accepted verdict even when remediation budget remains", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 5 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "accepted", verification: { ran: false } },
  });

  assert.deepEqual(
    { decision: decision.decision, reason: decision.reason },
    { decision: "complete-fail", reason: "reviewer reported verification did not run" },
  );
});

test("ConfigBasedReviewFixPolicy.decide should return terminal artifact when reviewer verification did not run", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 5 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "rejected", verification: { ran: false } },
  });

  assert.equal(
    decision.terminalArtifact?.content,
    "# Terminal Decision\n\nThe run failed because the reviewer reported that verification did not run.\n",
  );
});

test("ConfigBasedReviewFixPolicy.decide should complete-fail a rejected verdict without verification ran=true even when remediation budget remains", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 5 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "rejected", verification: { ran: false } },
  });

  assert.deepEqual(
    { decision: decision.decision, reason: decision.reason },
    { decision: "complete-fail", reason: "reviewer reported verification did not run" },
  );
});

test("ConfigBasedReviewFixPolicy.decide should complete-fail an unverified accepted verdict when remediation budget is exhausted", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 0 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "accepted", verification: { ran: false } },
  });

  assert.equal(decision.decision, "complete-fail");
});

test("ConfigBasedReviewFixPolicy.decide should return remediate on a failed verdict when remediation attempts remain", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  assert.equal(decision.decision, "remediate");
});

test("ConfigBasedReviewFixPolicy.decide should not return terminal artifact when remediation attempts remain", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(decision, "terminalArtifact"),
    false,
  );
});

test("ConfigBasedReviewFixPolicy.decide should consume one remediation attempt only when returning remediate", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });
  const acceptedDecision = await policy.decide({
    verdict: { verdict: "accepted", verification: { ran: true } },
  });

  const failedDecision = await policy.decide({
    session: acceptedDecision.session,
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  assert.equal(failedDecision.decision, "remediate");
});

test("ConfigBasedReviewFixPolicy.decide should return complete-fail on a failed verdict when remediation attempts are exhausted", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });
  const firstDecision = await policy.decide({
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  const secondDecision = await policy.decide({
    session: firstDecision.session,
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  assert.equal(secondDecision.decision, "complete-fail");
});

test("ConfigBasedReviewFixPolicy.decide should return terminal artifact when remediation attempts are exhausted", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });
  const firstDecision = await policy.decide({
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  const secondDecision = await policy.decide({
    session: firstDecision.session,
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  assert.equal(
    secondDecision.terminalArtifact?.content,
    "# Terminal Decision\n\nThe run failed because the remediation budget was exhausted after 1 remediation attempt.\n",
  );
});

test("ConfigBasedReviewFixPolicy.decide should pluralize remediation attempts in exhausted terminal artifact", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 0 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  assert.equal(
    decision.terminalArtifact?.content,
    "# Terminal Decision\n\nThe run failed because the remediation budget was exhausted after 0 remediation attempts.\n",
  );
});

test("ConfigBasedReviewFixPolicy.decide should return complete-fail on the first failed verdict when maxRemediationAttempts is 0", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 0 },
  });

  const decision = await policy.decide({
    verdict: { verdict: "rejected", verification: { ran: true } },
  });

  assert.equal(decision.decision, "complete-fail");
});

test("ConfigBasedReviewFixPolicy.decide should allow exactly five remediate decisions when maxRemediationAttempts is 5", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 5 },
  });
  const decisions = [];
  let session;

  for (let index = 0; index < 6; index += 1) {
    const decision = await policy.decide({
      session,
      verdict: { verdict: "rejected", verification: { ran: true } },
    });
    decisions.push(decision.decision);
    session = decision.session;
  }

  assert.deepEqual(decisions, [
    "remediate",
    "remediate",
    "remediate",
    "remediate",
    "remediate",
    "complete-fail",
  ]);
});

test("ConfigBasedReviewFixPolicy.decide should fail with RuntimeFailure when reviewer output has no string verdict", async () => {
  const policy = createConfigBasedReviewFixPolicy({
    reviewPolicy: { maxRemediationAttempts: 1 },
  });

  await assert.rejects(
    () => policy.decide({ verdict: {} }),
    RuntimeFailure,
  );
});
