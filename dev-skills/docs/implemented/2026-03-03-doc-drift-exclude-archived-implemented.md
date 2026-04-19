---
date: 2026-03-03
model: claude-opus-4-6
description: "Exclude archived and implemented docs from doc-drift-audit skill"
---

# Exclude Archived/Implemented Docs from Doc-Drift Audit

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hard-exclude `**/implemented/**` and `**/archived/**` paths from the doc-drift-audit skill's markdown discovery step.

**Architecture:** Single edit to the Preparation section's exclusion list in `SKILL.md`. Bump version to 1.3.0 (minor — new behavior, no breaking change).

**Tech Stack:** Markdown skill file

---

### Task 1: Update exclusion list in Preparation step

**Files:**
- Modify: `doc-drift-audit/SKILL.md:57`

**Step 1: Edit the exclusion bullet**

In section `### 1. Preparation`, item 3, replace the second bullet:

```markdown
   - Exclude `node_modules/`, `vendor/`, `.build/`, and similar generated directories.
```

with:

```markdown
   - Exclude `node_modules/`, `vendor/`, `.build/`, and similar generated directories.
   - Exclude `**/implemented/**` and `**/archived/**` directories — these are finished artifacts that describe past state, not current code.
```

**Step 2: Bump version**

In the frontmatter, change:

```yaml
version: "1.2.0"
```

to:

```yaml
version: "1.3.0"
```

**Step 3: Commit**

```bash
git add doc-drift-audit/SKILL.md
git commit -m "exclude implemented and archived dirs from doc-drift audit"
```
