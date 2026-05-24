---
date: 2026-04-30
model: gpt-5
description: "Config-based ReviewFixPolicy contract derived from ADR-008"
---

# Config-Based ReviewFixPolicy Spec

## Goal

The config-based review fix policy, owned by Reinix policy code, provides a `ReviewFixPolicy` implementation that remediates failed reviews until `maxRemediationAttempts` is exhausted.

## Public Interface

### Policy Settings Resolution

```text
resolvePolicySettings(workingDirectory: Path) -> PolicySettings | StartupValidationFailure
```

`PolicySettings`:

- `selectedPath`: selected `policy.yaml` path.
- `reviewPolicy.maxRemediationAttempts`: non-negative integer count of allowed remediation attempts after the initial Producer/Reviewer round.

`policy.yaml`:

```yaml
reviewPolicy:
  maxRemediationAttempts: 5
```

### Config-Based Policy

```text
createConfigBasedReviewFixPolicy(settings: PolicySettings) -> ReviewFixPolicy
```

The returned policy satisfies the Orchestrator-owned `ReviewFixPolicy` interface:

```text
decide(input: ReviewFixPolicyInput) -> ReviewFixPolicyOutput
```

`ReviewFixPolicyInput`:

- `verdict`: reviewer output object.
- `session`: optional opaque policy session returned by the previous decision.

`ReviewFixPolicyOutput`:

- `decision`: `complete-ok`, `complete-fail`, or `remediate`.
- `session`: opaque policy session for the next policy decision.
- `reason`: optional concise terminal failure reason.
- `terminalArtifact`: optional policy-authored terminal decision artifact.

The policy session is opaque to callers. Callers may pass the returned session into the next decision, but must not inspect its contents.

## Behavior Rules

### Settings Discovery

- Reinix must resolve policy settings from `./.reinix/policy.yaml` first, then `~/.reinix/policy.yaml`.
- If local `policy.yaml` exists, Reinix must not merge it with or fall back to global `policy.yaml`.
- When production composition selects `ConfigBasedReviewFixPolicy` and no `policy.yaml` exists at either location, Reinix must write `~/.reinix/policy.yaml.example` before failing.
- Reinix must not overwrite an existing `~/.reinix/policy.yaml.example`.
- Bootstrap must not create `policy.yaml` directly.
- Missing or invalid policy settings must fail with `StartupValidationFailure`.
- Policy settings failure messages must name `policy.yaml` or `policy.yaml.example`.

### Settings Validation

- `policy.yaml` must be a YAML mapping.
- `policy.yaml` must define a `reviewPolicy` mapping.
- `reviewPolicy.maxRemediationAttempts` is required.
- `reviewPolicy.maxRemediationAttempts` must be an integer greater than or equal to `0`.
- `maxRemediationAttempts: 0` is valid and means failed reviews complete with failure without remediation.
- Policy settings must not be stored in `agents.yaml` or `models.yaml`.

### Policy Decisions

- The policy must treat reviewer output with `verdict: "accepted"` and `verification.ran: true` as success and return `complete-ok`.
- The policy must treat reviewer output with `verification.ran` not equal to `true` as terminal failure and return `complete-fail`.
- The policy must treat any other non-empty string `verdict` as remediable failure.
- If the verdict is failure and `remediationAttempts < maxRemediationAttempts`, the policy must return `remediate`.
- If the verdict is failure and `remediationAttempts >= maxRemediationAttempts`, the policy must return `complete-fail`.
- A `maxRemediationAttempts` value of `5` permits at most five `remediate` decisions and therefore at most five Remediator calls.
- The initial Producer/Reviewer round must not count against `maxRemediationAttempts`.
- The policy must treat missing session state as zero prior remediation attempts.
- The policy must count only prior `remediate` decisions toward the remediation budget.
- The policy must return session state in every decision result so the next decision can enforce the budget.
- Terminal `complete-ok` and `complete-fail` decisions must return `terminalArtifact.content` as non-empty Markdown for the Orchestrator to persist through the terminal decision artifact contract.
- `remediate` decisions must not return a terminal artifact.
- The policy must fail with `RuntimeFailure` when reviewer output does not contain a non-empty string `verdict`.

### Orchestrator Boundary

- The Orchestrator must receive the config-based policy only as a `ReviewFixPolicy`.
- The Orchestrator must not resolve or inspect `policy.yaml`.
- The Orchestrator must not count remediation attempts, review rounds, verdict severities, or failure categories.
- The Orchestrator must thread the returned policy session unchanged into the next policy call.

## Tests (Required)

1. `resolvePolicySettings` should write `~/.reinix/policy.yaml.example` when no policy settings exist.
2. `resolvePolicySettings` should not overwrite existing `~/.reinix/policy.yaml.example`.
3. `resolvePolicySettings` should not create active `policy.yaml` during bootstrap.
4. `resolvePolicySettings` should fail with `StartupValidationFailure` when no policy settings exist.
5. `resolvePolicySettings` should use local `policy.yaml` instead of global `policy.yaml` when both exist.
6. `resolvePolicySettings` should not merge local and global policy settings.
7. `resolvePolicySettings` should reject non-mapping `policy.yaml`.
8. `resolvePolicySettings` should reject `policy.yaml` missing `reviewPolicy`.
9. `resolvePolicySettings` should reject `reviewPolicy` missing `maxRemediationAttempts`.
10. `resolvePolicySettings` should reject negative `maxRemediationAttempts`.
11. `resolvePolicySettings` should reject non-integer `maxRemediationAttempts`.
12. `resolvePolicySettings` should accept `maxRemediationAttempts` equal to `0`.
13. `ConfigBasedReviewFixPolicy.decide` should return `complete-ok` when verdict is `accepted` and verification ran.
14. `ConfigBasedReviewFixPolicy.decide` should refuse `complete-ok` when verdict is `accepted` but verification did not run.
15. `ConfigBasedReviewFixPolicy.decide` should refuse `complete-ok` when verdict is `accepted` but verification field is missing.
16. `ConfigBasedReviewFixPolicy.decide` should return `complete-fail` when reviewer verification did not run.
17. `ConfigBasedReviewFixPolicy.decide` should return `remediate` on a failed verdict when remediation attempts remain.
18. `ConfigBasedReviewFixPolicy.decide` should consume one remediation attempt only when returning `remediate`.
19. `ConfigBasedReviewFixPolicy.decide` should return `complete-fail` on a failed verdict when remediation attempts are exhausted.
20. `ConfigBasedReviewFixPolicy.decide` should return `complete-fail` on the first failed verdict when `maxRemediationAttempts` is `0`.
21. `ConfigBasedReviewFixPolicy.decide` should allow exactly five `remediate` decisions when `maxRemediationAttempts` is `5`.
22. `ConfigBasedReviewFixPolicy.decide` should return a terminal artifact when verdict is accepted and verification ran.
23. `ConfigBasedReviewFixPolicy.decide` should return a terminal artifact when reviewer verification did not run.
24. `ConfigBasedReviewFixPolicy.decide` should not return a terminal artifact when remediation attempts remain.
25. `ConfigBasedReviewFixPolicy.decide` should return a terminal artifact when remediation attempts are exhausted.
26. `ConfigBasedReviewFixPolicy.decide` should pluralize remediation attempts in exhausted terminal artifacts.
27. `ConfigBasedReviewFixPolicy.decide` should fail with `RuntimeFailure` when reviewer output has no string `verdict`.
28. `runWorkflow` should use the config-based policy as an injected `ReviewFixPolicy` without the Orchestrator reading `policy.yaml`.
29. `runWorkflow` should forward the config-based policy session unchanged between policy calls.

## Done Criteria

- `policy.yaml` resolution follows local-before-global discovery with no merging.
- First-run bootstrap writes `~/.reinix/policy.yaml.example` without overwriting existing examples and without creating active settings.
- Policy settings validation enforces `reviewPolicy.maxRemediationAttempts` as a non-negative integer.
- `ConfigBasedReviewFixPolicy` returns `complete-ok`, `remediate`, or `complete-fail` according to verdict and remediation budget.
- `ConfigBasedReviewFixPolicy` returns terminal artifacts for terminal decisions through the existing terminal decision artifact contract.
- `maxRemediationAttempts` counts only Remediator attempts, not the initial Producer/Reviewer round.
- The Orchestrator remains isolated from policy config and budget logic.
- Required policy settings and decision tests pass.
