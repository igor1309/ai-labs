---
date: 2026-01-27
model: gpt-5.2
---

# Automatic Issues from `sandbox/` and `TODO.md`

This repository uses an automated workflow that turns certain newly added files into GitHub Issues.

The goal is to ensure that drafts, experiments, and explicit TODOs are always visible and tracked.

---

## When It Runs

- Triggered on **every push to `trunk`**
- The workflow inspects **only the changes introduced by that push**

---

## What It Detects

### 1. `sandbox/` Top-Level Entries

An issue is created when a **new direct child** is added under `sandbox/`.

Examples:
- ✅ `sandbox/idea.md`
- ✅ `sandbox/prototype/`
- ❌ `sandbox/prototype/notes.txt` (not top-level)

Files and directories are treated the same.  
Renames are treated as new entries.

---

### 2. `TODO.md` Files

An issue is created when a **new `TODO.md` file** is added anywhere in the repository.

Examples:
- ✅ `TODO.md`
- ✅ `docs/TODO.md`
- ✅ `features/auth/TODO.md`

There are no ignored paths.

---

## Issue Creation Rules

- **One issue per item**
- Issues are created **only if the item exists in the final state of the push**
- The workflow is **idempotent**:
  - If an open issue already exists for the same item, no new issue is created
  - Closed issues do not block new ones

---

## Issue Titles and Content

### Sandbox Entries

- **Title**
  ```
  [sandbox] <name>
  ```
- **Body**
  - Link to `sandbox/<name>`

---

### `TODO.md` Files

- **Title**
  ```
  [todo] <full-repo-relative-path>
  ```
  Example:
  ```
  [todo] docs/guides/TODO.md
  ```

- **Body**
  - Link to the full path of the `TODO.md` file

---

## What Does *Not* Happen

- No issues are created for changes outside these rules
- No aggregation of multiple items into a single issue
- No special ordering guarantees
- No path-based ignore list

---

## Why This Exists

- `sandbox/` is for experiments and WIP ideas — issues ensure they don’t get forgotten
- `TODO.md` is a strong signal of unfinished or planned work
- Automation keeps tracking consistent and frictionless