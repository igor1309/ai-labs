---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-008: install: settings/home alone writes home's settings, every write can be undone, check reports and does not gate"
---

# ADR-008: Install

- **Status:** Accepted
- **Date:** 2026-10-14
- **Scope:** how settings reach home and how that is undone
- **Decision type:** Architecture

## Context

Home's settings come from elsewhere, such as a repository. Copied by hand,
a change can lose what it replaces, and going back means finding a copy.
Home also holds Agister's runs.

## Decision

`settings/home` installs settings into home and restores them from what
an install kept. Every write into home's settings can be undone.

## Rules

### 1. Only home's settings are written

`settings/home` writes home's settings and the backups it keeps of them.
Agister's runs and other state in home are not its to touch.

### 2. Every write can be undone

An install keeps what it replaces and what it creates, before it writes.
A restore puts home's settings back as they were before that install.

### 3. Check reports, it does not gate

What an install writes is checked as any settings are (ADR-002, rule 8).
A problem refuses only what depends on it; restore is the way back.

### 4. A broken home can always be written

Install and restore do not depend on settings that resolve, so a home
whose settings have problems can still be installed over or restored.

## Consequences

- Settings reach home in one step, and leave it in one.
- Home holds backups beside its settings.
