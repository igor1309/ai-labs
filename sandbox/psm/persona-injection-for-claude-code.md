---
date: 2026-02-24
model: claude-opus-4-6
description: "Discussion on injecting persona cues into Claude Code, inspired by Anthropic's PSM paper"
---

# Persona Injection for Claude Code

## PSM tl;dr

LLMs learn to simulate diverse characters during pre-training, and post-training elicits and refines a particular Assistant persona. Interactions with an AI assistant are then well-understood as being interactions with the Assistant — something roughly like a character in an LLM-generated story. PSM has consequences for AI development, such as recommending anthropomorphic reasoning about AI psychology and introduction of positive AI archetypes into training data. An important open question is how exhaustive PSM is, especially whether there might be sources of agency external to the Assistant persona, and how this might change in the future.

Source: [The Persona Selection Model: Why AI Assistants might Behave like Humans](https://alignment.anthropic.com/2026/psm/)

## Context

Anthropic published [The Persona Selection Model](https://alignment.anthropic.com/2026/psm/) — the idea that LLMs learn to simulate diverse characters during pre-training, and post-training elicits a particular Assistant persona. Brief identity cues can shift which persona gets "selected."

Goal: add something like "act as one of the best iOS developers" to Claude Code setup.

## Options Evaluated

### 1. Tweak Claude Code system prompt

`--system-prompt` and `--append-system-prompt` flags exist but only work in non-interactive CLI mode (`-p`). Not usable for day-to-day interactive sessions.

**Verdict:** not viable for this use case.

### 2. AGENTS.md / CLAUDE.md

`~/.codex/AGENTS.md` is imported by both global and project CLAUDE.md — single source of truth. Loaded at session start, persistent, zero overhead.

**Verdict:** best fit. Put persona cue at the top.

### 3. Hook injection (SessionStart / UserPromptSubmit)

Works but adds machinery for what AGENTS.md does natively. Hooks are better for dynamic content.

**Verdict:** overkill for static identity text.

### 4. Other (skills, subagents)

Skills require invocation. Subagents run in isolation. Neither solves "always-on persona."

**Verdict:** wrong tool for this job.

## Decision

One concise sentence in `~/.codex/AGENTS.md` at the top, before `## GENERAL`:

> You are a world-class software engineer.

No fictional credentials ("15+ years"), no behavioral instructions (rules already cover that). The identity cue primes the persona; the rules define what that persona *does*.

For iOS-specific projects, add one line in the project-level `.claude/AGENTS.md`:

> You are an expert iOS/Swift developer.

Both signals stack without essay bloat.

## Key Insight from PSM

Identity cues are *triggers*, not instruction manuals. A short, well-placed statement shifts persona selection. The detailed practices (TDD, code style, architecture rules) belong in the rules — not in the identity preamble.

## Open Questions

- Does reinforcement via `SessionStart` hook help after context compaction, or is CLAUDE.md re-injected anyway?
- Is there a measurable difference between "world-class software engineer" vs "expert software engineer" vs "senior software engineer"?
- Would a negative framing ("never write junior-level code") be counterproductive per PSM?
