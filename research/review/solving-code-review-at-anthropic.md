---
date: 2026-10-21
author: Igor Malyarov
model: gpt-6.1-sol 
source: https://claude.dev/blog/solving-code-review-at-anthropic/
version: 0.0.1
---

# How the Claude Code team does code review

| Actionable insight | How to apply it | Why keep it |
|---|---|---|
| **Require execution evidence** | Ask agents for test results, build output, or screenshots before opening a PR. | Gives reviewers observable proof of behavior. |
| **Review with fresh context** | Run an independent agent review before human review. | Adds a second perspective on assumptions and bugs. |
| **Turn recurring feedback into rules** | Move repeated findings into lint checks, project instructions, or a short `REVIEW.md`. | Makes each correction improve future changes. |
| **Demand grounded findings** | Require file-and-line evidence; verify findings before posting them. | Preserves reviewer attention and reduces unnecessary fixes. |
| **Scale approval by risk** | Define risk tiers; require human review for sensitive paths and architecture. | Directs expertise toward consequential decisions. |
| **Make review converge** | Cap rounds; review new diffs on later passes; report whole bug classes. | Controls review churn and encourages complete fixes. |
| **Build reversibility into delivery** | Use small changes, merge queues, feature flags, staged releases, and quick rollback. | Limits impact and speeds recovery. |
| **Turn incidents into evaluations** | Replay confirmed historical bugs whenever reviewer prompts, tools, or models change. | Measures improvement against actual failures. |
| **Measure total human effort** | Track review waiting, approvals, reverts, and incidents together. | Shows whether automation saves effort across delivery and recovery. |

## Making review converge

- A round cap. After three rounds, the reviewer asks the author to step back and reconsider the approach.
- Diff-only re-review after the first few passes.
- Flag the class of bug, so the author fixes every instance, not one line.
- No repeats of findings already posted.

These practices come from the team’s reported workflow. [oai_citation:0‡claude.dev](https://claude.dev/blog/solving-code-review-at-anthropic/?utm_source=chatgpt.com)