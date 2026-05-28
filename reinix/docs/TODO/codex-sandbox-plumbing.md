---
date: 2026-05-19
model: claude-opus-4-7
description: "Surface codex sandbox/approval settings so reviewer agents can run verification commands that need filesystem writes outside the workspace"
---

# Codex sandbox plumbing for reviewer verification

## Findings

### Incident

Run `20260519T071122Z-cl6e1dz7` (task: `swift-vortex/Sources/Feature/CardToCardP2P/Backend/TransferRequest/transfer-request-task.md`). Producer succeeded (claude-code, 6m58s, $0.77). Reviewer (openai/codex/gpt-5.5) reached OpenAI cleanly (schema patch from `openai-strict-schema-fix.md` worked) and returned a structured verdict with `verification.ran = false`. `ConfigBasedReviewFixPolicy` mapped that to `complete-fail` and the run terminated.

### What the reviewer said

From `review-01.md`:

> Verification was attempted independently with the declared CardToCardP2P scheme and targeted test classes. The first run exited 74 before tests due sandbox-denied writes to `/Users/igormalyarov/.cache/clang/ModuleCache` and `/Users/igormalyarov/Library/Caches/org.swift.swiftpm/manifests/ManifestLoading/*.dia`. I made one diagnostic rerun with `HOME`, `CLANG_MODULE_CACHE_PATH`, and `-derivedDataPath` redirected under `/private/tmp`; it also exited 74 during package dependency resolution with `Could not resolve package dependencies:`. Because the verification command did not successfully execute to the test phase in this reviewer environment, the result cannot be accepted under the review contract.

### Root cause

Codex CLI runs commands inside its own `workspace-write` sandbox by default (visible in the reviewer's stderr: `sandbox: workspace-write [workdir, /tmp, $TMPDIR, /Users/igormalyarov/.codex/memories]`). Apple toolchain commands like `xcodebuild` and SwiftPM dependency resolution write to user-level caches outside that allowlist:

- `~/.cache/clang/ModuleCache`
- `~/Library/Caches/org.swift.swiftpm/manifests/ManifestLoading/*.dia`
- `~/Library/Developer/Xcode/DerivedData` (unless redirected)
- Various SPM checkout/build state

Redirecting these via env vars / `-derivedDataPath` still fails because SPM resolution traverses repository state and remote checkouts the sandbox can't accommodate.

Reinix today has no way to pass codex sandbox or approval flags. The codex runner (`src/provider-cli-executor.js:60-101`) forwards only `--model`, optional `--config model_reasoning_effort=…`, and `--output-schema`. Reviewer agents whose verification step is xcodebuild therefore cannot succeed under codex with default settings.

This is independent of the reviewer prompt contract; the prompt explicitly requires `verification.ran=false` when the command can't execute. The fix is to give codex the permissions it needs.

## Proposed changes

### 1. Extend `models.yaml` provider settings

Add optional codex-specific fields under provider entries that select `runner: codex`:

```yaml
providers:
  openai:
    runner: codex
    sandbox: workspace-write          # or read-only | danger-full-access
    approvalPolicy: on-failure        # never | on-failure | untrusted
    writableRoots:                    # extra paths appended to sandbox allowlist
      - ~/.cache/clang
      - ~/Library/Caches/org.swift.swiftpm
      - ~/Library/Developer/Xcode/DerivedData
    models:
      high:
        model: gpt-5.5
        reasoningEffort: high
```

`sandbox`, `approvalPolicy`, and `writableRoots` are optional. When absent, reinix passes nothing extra and codex uses its own defaults (current behavior).

### 2. Pass through to the codex CLI

In `src/provider-cli-executor.js` (`executeCodex`), append the corresponding codex flags when the provider settings declare them:

- `sandbox` → `--sandbox <value>`
- `approvalPolicy` → `--ask-for-approval <value>` (codex flag name: verify with `codex exec --help` on the installed version)
- each entry in `writableRoots` → `--writable-root <expanded-path>` (verify exact flag in the installed codex version; `codex exec` exposes a writable-root list flag)

Expand `~` and relative paths against `process.env.HOME` and the invocation working directory before appending.

### 3. Validate at startup

Add a settings validator that, when a provider declares `runner: codex` and any of `sandbox / approvalPolicy / writableRoots`, asserts:

- `sandbox` ∈ {`read-only`, `workspace-write`, `danger-full-access`}.
- `approvalPolicy` is one of the values the installed codex version accepts.
- `writableRoots` is a list of strings.

Fail fast with `StartupValidationFailure` and a path to the offending file.

### 4. Document the trade-off

Update `README.md` and `docs/reinix-orchestration.md`:

- A reviewer that runs xcodebuild / swift / docker / any command that writes outside the workspace needs either `sandbox: danger-full-access` or an explicit `writableRoots` list. The former trades safety for capability; reinix surfaces both so the user makes the choice consciously.
- For untrusted task sources, prefer pinning `sandbox: workspace-write` and adding only the specific roots needed.

### 5. Tests

- Unit: codex argument builder honors each new field when present and omits it when absent.
- Unit: settings validator rejects unknown values for each field with a useful message.
- Integration (fake provider mode): a `codex` runner config with all three fields produces a recorded command line including the expected flags.

## Verification of the underlying assumption

Before implementing, confirm on the installed codex version:

```bash
codex exec --help | grep -E "sandbox|approval|writable"
```

Adjust flag names in step 2 to match the installed CLI's actual options. The current observed default banner (`sandbox: workspace-write`) confirms the field exists; the exact CLI surface for changing it and for adding writable roots must be checked against the version reinix targets, not assumed.

## Workaround until this lands

In `~/.reinix/agents.yaml`, switch the reviewer to claude-code so xcodebuild runs unsandboxed:

```yaml
  reviewer:
    provider: anthropic
    model: high
    prompt:
      ref: reinix://prompts/reviewer
    output:
      schemaRef: reinix://schemas/reviewer-output
```

Trade-off: no second-opinion model. The OpenAI strict-schema workaround in `openai-strict-schema-fix.md` becomes unnecessary while the reviewer is on anthropic, but should remain in place because the underlying schemas are still strict-non-compliant for any future codex agent.
