---
date: 2026-04-23
model: claude-opus-4-6
description: "Fix notio path filter in ci.yml to skip notio-core on doc-only changes"
---

# Fix notio CI path filter

## Problem

PR #210 contains only doc/research changes under `notio/` but triggers `notio-core` (Swift container build + test — expensive). The `notio` filter in `ci.yml` is `notio/**` with no exclusions.

## Plan

### Step 1: Add exclusion patterns to the `notio` filter

**File:** `.github/workflows/ci.yml`, lines 65-66

**Current:**
```yaml
notio:
  - "notio/**"
```

**Proposed:**
```yaml
notio:
  - "notio/**"
  - "!notio/docs/**"
  - "!notio/research/**"
  - "!notio/README.md"
```

This uses `dorny/paths-filter` negation syntax. A change that only touches excluded paths will produce `notio: false`, skipping `notio-core`.

Changes that touch both code and docs (e.g., `notio/Sources/Foo.swift` + `notio/docs/log.md`) still trigger the build because at least one path matches the positive pattern and is not negated.

**No other filters need changes:**
- `release` filter also includes `notio/**` but `release-validation` is cheap (Node scripts only) — no change needed.
- `notio-ci` filter watches only `.github/workflows/notio-core.yml` — unaffected.

### Verification

- Check the PR #210 changed files against the updated filter — all files (`notio/docs/**`, `notio/research/**`, `notio/README.md`) are excluded, so `notio-core` would be skipped.
- Commit and push. Observe that the re-triggered CI skips `notio-core`.
