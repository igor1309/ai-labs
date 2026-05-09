---
date: 2026-05-09
author: Igor Malyarov
version: 0.0.5
status: proposed
source_intent: Automated Doc Drift Review and Fix Suggestions. Intent v0.0.3
---

# ADR: Use a Specialized OpenClaw Agent for README Drift Review

## Context

`ai-labs` is a mono-repo with multiple projects.

Each project has its own README. The repo also has a root README.

READMEs can drift from each other or from the actual repo state.

An OpenClaw instance is already running.

## Decision

Use a new specialized OpenClaw agent for README drift review and fix suggestions.

Reuse the existing running OpenClaw instance.

The agent will:

- inspect the root README and project READMEs
- compare README claims against each other
- compare README claims against the actual repo state
- report detected drift with evidence
- suggest README changes
- propose README fixes as PRs

The agent must support:

- manual initiation
- scheduled drift checks
- automated notifications when drift is found

Scheduled checks must not run if a manual drift analysis was invoked less than 12 hours earlier.

The agent must never merge PRs automatically.

## Boundary

The agent proposes evidence-backed README fixes as PRs.

The maintainer reviews proposed README fixes through the normal repo flow.

## Consequences

README drift review is handled by a dedicated agent inside the existing OpenClaw instance.

README fixes enter the same review path as normal repo changes.

The maintainer can notice README drift without manually comparing READMEs and repo state.
