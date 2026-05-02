---
title: ADR-004 — Session Digest Home Settings
date: 2026-04-27
status: accepted
model: gpt-5
version: 1.0
description: "Locks home-scoped session-digest settings, credential separation, settings override precedence, and ledger-only local ergonomics."
---

# ADR-004: Session Digest Home Settings

## Status

Accepted.

## Executive Summary

`session-digest` will use home-scoped settings only. Non-secret behavioral settings live in `~/.session-digests/settings.env`; provider credentials and secret-like values remain in `~/.session-digests/.env`. The CLI will not read `<cwd>/.session-digests/` settings for now because `session-digest` operates on explicit session files and should not change behavior based on the launch directory. The first required setting is `MODEL_CONTEXT_MAX_BYTES`, with a namespaced process-environment override for one-off runs. Ledger-only mode is accepted as the next local-ergonomics direction.

## Context

ADR-003 made bounded model synthesis a core invariant, but the `250,000` byte model-context budget currently lives only as a source-code default. That makes routine tuning a code change, even though the value is operational policy rather than a structural invariant.

`session-digest` also currently uses `~/.session-digests/.env` for provider credentials and provider model names. Mixing non-secret behavior settings into the same file would make the file ambiguous and increase the chance that users treat all settings as secrets or all values as non-secrets.

Repository-local settings discovery was considered and rejected for now. Unlike a workflow runner that is naturally tied to a repository, `session-digest` processes an explicit Claude Code JSONL file. The same input file should not compile with different budgets merely because the user launches the command from a different directory.

## Decision

`session-digest` will introduce a separate home-scoped settings file for non-secret behavior:

```text
~/.session-digests/settings.env
```

The existing credential file remains:

```text
~/.session-digests/.env
```

Settings resolution for values supported by `settings.env` is:

```text
source default < ~/.session-digests/settings.env < SESSION_DIGEST_* process environment override
```

The first required settings key is:

```env
MODEL_CONTEXT_MAX_BYTES=250000
```

The corresponding process-environment override is:

```env
SESSION_DIGEST_MODEL_CONTEXT_MAX_BYTES=250000
```

## Rules / Invariants

- `settings.env` MUST contain only non-secret behavior settings.
- `.env` MUST remain the home for provider credentials and secret-like provider environment values.
- The CLI MUST NOT read `<cwd>/.session-digests/settings.env` or any repository-local settings path until a later ADR changes this decision.
- Missing `settings.env` MUST NOT block execution when source defaults are sufficient.
- Invalid supported settings values MUST fail before model calls.
- `SESSION_DIGEST_*` process environment variables MAY override supported `settings.env` values for one invocation.
- `SESSION_DIGEST_*` overrides MUST be namespaced; unprefixed process environment variables MUST NOT override `settings.env`.
- `MODEL_CONTEXT_MAX_BYTES` MUST configure the bounded model-context budget used by ledger compilation.
- `SESSION_DIGEST_MODEL_CONTEXT_MAX_BYTES` MUST override `MODEL_CONTEXT_MAX_BYTES` when both are present.
- Ledger-only mode MUST compile and persist the derived ledger without requiring provider credentials or a model call.
- Ledger-only mode MUST preserve ADR-003 raw-input retention rules: it must not copy or persist raw JSONL.

## Consequences

Users can tune the model-context budget without editing source code. Keeping credentials in `.env` and operational settings in `settings.env` makes the file responsibilities clear.

Home-only discovery is intentionally less flexible than repository-local overrides, but it keeps session digestion stable across launch directories. If project-local behavior becomes valuable later, it should be introduced by a new ADR with explicit precedence and reproducibility rules.

Ledger-only mode gives a low-friction local workflow for testing parser and compiler behavior without network access, provider credentials, or model cost. It also creates a natural debugging artifact when digest synthesis fails.

## Non-Goals

- Publishing `session-digest` as an npm package.
- Adding a global install path.
- Defining the exact command spelling for ledger-only mode.
- Moving provider credentials out of `~/.session-digests/.env`.
- Adding repository-local settings discovery.
- Adding multi-session settings, watched folders, or scheduler behavior.
