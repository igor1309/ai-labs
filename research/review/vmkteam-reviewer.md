---
date: 2026-04-24
source: [GitHub - vmkteam/reviewer: Review your PR via Claude Code · GitHub](https://github.com/vmkteam/reviewer)
---

Yes, you can borrow useful parts. The repo is public and the README declares **MIT** license, so the public code is intended to be reusable with normal MIT attribution constraints. I did not find a separate `LICENSE` file at the raw URL, so treat the README license statement as the visible signal, not a full legal audit.  [oai_citation:0‡GitHub](https://github.com/vmkteam/reviewer)

## What is useful to borrow

### 1. Claude Code runner pattern

The strongest reusable piece is not the product; it is the execution boundary:

```text
reviewctl
  -> fetch/build prompt
  -> run local `claude`
  -> parse structured JSON output
  -> persist artifacts
  -> comment/report
```

Their runner shells out to:

```text
claude --print --output-format json --model ... --permission-mode bypassPermissions -p -
```

and feeds the prompt through stdin. That is directly relevant for Regentara: model invocation is a replaceable runner, not hardwired application logic.  [oai_citation:1‡GitHub](https://raw.githubusercontent.com/vmkteam/reviewer/master/pkg/reviewer/ctl/claude.go)

### 2. Parse Claude Code JSON as a contract

They model Claude Code output as structured data: result text, cost, duration, turns, session id, stop reason, token usage, model usage, permission denials. That is useful for orchestration observability and audit trails.  [oai_citation:2‡GitHub](https://raw.githubusercontent.com/vmkteam/reviewer/master/pkg/reviewer/ctl/claude.go)

For Regentara, I would borrow the idea, not necessarily their structs:

```text
AgentRunResult
  output
  sessionId
  cost
  modelUsage
  tokenUsage
  stopReason
  terminalReason
  rawOutputPath
```

### 3. Session reuse / continuation

The README mentions `--session` / `--continue` for Claude prompt cache reuse, and the runner supports `--resume` and `--continue`. That maps well to your loop, where repeated review/fix cycles can preserve context or cache.  [oai_citation:3‡GitHub](https://github.com/vmkteam/reviewer)

### 4. Artifact pipeline

Their flow persists review JSON plus markdown report files, uploads them, then displays/comments them. This is close to your “filesystem as shared context + verifiable artifacts” model.  [oai_citation:4‡GitHub](https://github.com/vmkteam/reviewer)

Borrow the structure:

```text
Run
  input artifact
  prompt artifact
  raw model output
  normalized result
  human/report artifact
  upload/comment/export step
```

### 5. Review taxonomy

They have five review types:

```text
architecture
code
security
tests
operability
```

and severity levels:

```text
critical
high
medium
low
```

This is reusable as a starting taxonomy for adversarial review.  [oai_citation:5‡GitHub](https://github.com/vmkteam/reviewer)

## What is probably hidden / less useful

The real prompts are likely **not meaningfully present in the repo**.

The architecture says `reviewctl` fetches the prompt from:

```text
/v1/prompt/$PROJECT_KEY/
```

and the server has admin management for projects/prompts. The prompt endpoint is explicitly classified as **internal, CI-only, must not be exposed externally**.  [oai_citation:6‡GitHub](https://github.com/vmkteam/reviewer)

So the public repo gives you the **prompt delivery mechanism**, not necessarily the proprietary prompt content.

## What not to copy blindly

1. **The full backend/admin product**  
   Too much for Regentara unless you want a review SaaS/admin panel. Their stack includes Go, Echo, PostgreSQL, Vue admin UI, JSON-RPC, generated clients, Slack, GitLab comments. Useful reference, but likely overbuilt for your first orchestration slice.  [oai_citation:7‡GitHub](https://github.com/vmkteam/reviewer)

2. **`bypassPermissions` default**  
   Good for controlled CI, dangerous as a default orchestration policy. Regentara should make permission policy explicit per runner/task.

3. **Prompt-as-server-endpoint as the core abstraction**  
   For your local/agent-loop use case, prompt artifacts on disk may be more aligned than central prompt fetch. Server-backed prompt templates can come later.

## Best borrow list for Regentara

```text
A. Runner abstraction around Claude Code CLI
B. Structured parsing of `claude --output-format json`
C. Raw output persistence for postmortem/debugging
D. Normalized run metadata: cost, tokens, turns, session id
E. Session resume/continue support
F. Review result schema with severity and category
G. CI/local symmetry: same CLI works locally and in automation
H. Report/comment/export as adapters, not core loop logic
```

## Bottom line

The public value is **orchestration mechanics**, not “magic prompts.”

For Regentara, this repo is useful as a reference for:

```text
Claude Code runner + artifact normalization + review result persistence
```

It is less useful as a prompt source, because the important prompts appear to be project-specific data managed through the backend/admin panel and served through an internal `/v1/prompt/:projectKey/` endpoint.

---

Your instinct is sound: **a reviewer can start as a skill**, especially if the first target is “reusable tool inside agents,” not “CI product with admin backend.”

But I would not make it *only* a skill.

## Better framing

```text
Reviewer = review protocol + review prompts + evidence contract
Skill    = one interface for invoking that protocol inside an agent
Binary   = another interface for invoking the same protocol from CI / scripts
```

So the durable artifact should not be “a Claude skill” or “a binary.”  
It should be the **reviewer spec/package**.

## What the `vmkteam/reviewer` repo suggests

That repo externalizes the reviewer into a `reviewctl` binary. It fetches prompts from a backend, runs `claude --print --output-format json`, parses the result, uploads artifacts, and can comment on GitLab MRs. The useful part is the shape: **review task → Claude Code execution → structured review artifact → publication**. The less useful part for your case is the backend prompt server and admin surface.  [oai_citation:0‡GitHub](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md?utm_source=chatgpt.com)

Anthropic’s own Claude Code code-review plugin is closer to your “reviewer as reusable agent capability” idea: it exposes `/code-review`, gathers repo guidelines, summarizes PR changes, then launches specialized agents in parallel for compliance, bugs, and history/context analysis.  [oai_citation:1‡GitHub](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md?utm_source=chatgpt.com) Their docs also describe Code Review as a PR analyzer that posts inline findings, using specialized agents over the full codebase context.  [oai_citation:2‡Claude](https://code.claude.com/docs/en/code-review?utm_source=chatgpt.com)

## My recommendation

### Build it first as a skill

A skill is the right first implementation when the reviewer is meant to be used by agents during work:

```text
Agent finishes task
  -> invokes reviewer skill
  -> reviewer inspects task brief, diff, changed files, tests, constraints
  -> emits structured findings
  -> agent fixes or escalates
```

This fits your operating model better than a standalone service, because the reviewer lives inside the same repo/context/session where the coding agent already operates.

### But define it as a portable review protocol

The skill should produce a stable artifact, for example:

```yaml
review:
  verdict: pass | fail | blocked
  confidence: low | medium | high
  scope:
    task: ...
    base_ref: ...
    head_ref: ...
  findings:
    - id: R001
      severity: critical | high | medium | low
      category: correctness | architecture | tests | security | operability
      file: ...
      line: ...
      claim: ...
      evidence: ...
      suggested_fix: ...
  missing_evidence:
    - ...
```

This prevents the skill from becoming just a long prompt with prose output.

## Skill vs binary

| Option | Good for | Weakness |
|---|---|---|
| **Skill only** | Agent-internal review, fast iteration, prompt reuse | Harder to run deterministically in CI |
| **Binary only** | CI, reproducible execution, GitHub/GitLab integration | Less natural inside agent workflows |
| **Hybrid** | Best long-term shape | Requires clean contract early |

I’d choose **hybrid, skill-first**.

## What the skill should contain

```text
reviewer/
  SKILL.md
  prompts/
    review-task.md
    review-diff.md
    review-tests.md
    review-architecture.md
  schemas/
    review-result.schema.json
  templates/
    finding.md
    final-report.md
  scripts/
    collect-context.sh       optional
    normalize-diff.sh        optional
```

The skill should define:

1. **Inputs**
   ```text
   task brief
   implementation plan, if present
   diff
   changed files
   test output
   relevant architecture/spec docs
   project coding rules
   ```

2. **Review modes**
   ```text
   task-compliance
   correctness
   architecture
   tests
   security
   operability
   regression-risk
   ```

3. **Output contract**
   ```text
   machine-readable review.json
   human-readable review.md
   optional inline comments
   ```

4. **Pass/fail rules**
   ```text
   fail on unresolved high/critical findings
   block on insufficient evidence
   pass only when task acceptance criteria are checked
   ```

## What I would borrow from `vmkteam/reviewer`

Borrow:

```text
A. Review categories: architecture / code / security / tests / operability
B. Severity taxonomy
C. Structured JSON output
D. Review artifact persistence
E. Claude Code CLI execution pattern
F. Session/cost/token metadata
G. Upload/comment as an adapter, not core review logic
```

Do not borrow early:

```text
A. Backend prompt server
B. Admin UI
C. Project-key prompt delivery
D. GitLab-only assumptions
E. bypassPermissions as default policy
```

## Important design decision

A reviewer skill should **not fix**.

It should only:

```text
inspect
classify
cite evidence
produce findings
declare pass/fail/blocked
```

Fixing belongs to another skill/agent/phase. Otherwise the reviewer becomes judge + implementer, which weakens adversarial value.

## Practical first version

I’d start with this minimal workflow:

```text
/review-task
  input:
    - task brief path
    - implementation summary path, optional
    - git diff against base
    - test command/output, optional

  output:
    - .review/review.json
    - .review/review.md
```

No backend.  
No CI integration yet.  
No comments on GitHub/GitLab yet.

Then later add:

```text
reviewctl
  -> invokes same review protocol
  -> suitable for CI
  -> emits same review.json / review.md
```

## Bottom line

Your “reviewer as skill” idea is the right starting point.

But the thing to protect architecturally is this:

```text
reviewer core ≠ Claude skill
reviewer core = review protocol + schemas + prompts + evidence rules
Claude skill = one adapter
CLI/binary = another adapter
CI bot = another adapter
```

That gives you agent-native reuse now and avoids painting yourself into a Claude-only, session-only corner later.

---

