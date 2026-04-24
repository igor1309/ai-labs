---
date: 2026-04-24
model: gpt-5
description: "Release unit discovery rules and explicit configured basename validation"
---

# ADR-005 --- Release Unit Discovery & Validation

## 1. Executive Summary

Release units are discovered via config-driven generator.

## 2. Context

Implicit auto-discovery creates drift and accidental releases.

## 3. Decision

Use `release-units.config.toml` as discovery boundary. Generate
committed `release-units.toml`.

## Amendment: Explicit Configured Basenames

The generator MUST support explicit configured basenames for nested
release units.

The committed manifest MUST record both `basename` and `path` for each
release unit.

CI MUST fail when:

-   two units share a basename
-   a basename contains `_`
-   a configured path resolves to more than one canonical metadata file
-   generated manifest output differs from the committed manifest

## 4. Rules / Invariants

-   Discovery MUST be limited to configured prefixes.
-   Generator output MUST be committed.
-   CI MUST fail if manifest drifts.
-   Each unit MUST contain exactly one canonical metadata file.

## 5. Consequences

-   Controlled evolution.
-   Transparent unit registry.

## 6. Non-Goals

-   Fully dynamic discovery
