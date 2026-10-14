---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-008: install: a folder of settings is merged into home document by document, checked staged, written as shown, and undone from its backup"
---

# ADR-008: Install

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** how settings reach home, what is checked before they do, the
  backup taken, and how an install is undone
- **Decision type:** Architecture

## Context

Home's settings come from somewhere else: a repository, a shared folder.
Copied by hand, nothing shows what changes, nothing checks the result
before it is live, and going back means finding a copy. Home also holds
Agister's state, which no settings change may touch (ADR-001,
invariant 5).

## Decision

`settings/home` installs a folder of settings into home, document by
document. It plans each document, checks the result staged, writes only
what was shown and checked, and backs up first, so that a restore undoes
the install.

## Rules

### 1. Only settings documents are installed

An install takes the folder's settings documents, by kind and name
(ADR-002, rule 1), skills included. Anything else in the folder is
reported and not installed. Home's state is never read, written or
backed up.

### 2. The plan is per document

Each document is planned as created, replaced or unchanged; a replaced
one shows its diff. A document only home has is kept. An install with
nothing to create or replace writes nothing.

### 3. The result is checked before it is live

The plan is applied to a staged copy of home's settings, and check runs
on it as home (ADR-002, rule 8). An install that would add a problem is
refused; its warnings are shown with the plan.

### 4. What is written is what was shown

The caller confirms the plan. An install writes the documents as they
were shown and checked, and is refused if home's settings changed since
the plan; it never plans again silently. Each document is written whole.

### 5. A backup is taken before anything changes

Before its first write, an install records a backup: the documents it
will replace, and what it will create. A restore puts the replaced ones
back and removes the created ones, so it undoes an install that stopped
halfway too. Backups are bounded.

### 6. Nothing is deleted but by restore

An install deletes no document. A restore deletes only what its backup
records as created.

### 7. A broken home can still be repaired

Install and restore do not wait on settings that resolve: a home whose
settings have problems can be installed over or restored.

## Consequences

- Settings move into home in one step, with a diff, a check and a way
  back.
- Home gains backups, state that is not settings.
- An install is not one atomic switch: a reader may see some documents
  new and some old until it ends; the backup makes that state restorable.
