---
date: 2026-04-23
model: claude-opus-4-6
description: "Fix notio path filter in ci.yml to skip notio-core on doc-only changes"
---

# Fix notio CI path filter

## Problem

PR #210 contains only doc/research changes under `notio/` but triggers `notio-core` (Swift container build + test — expensive). The `notio` filter in `ci.yml` is `notio/**` which matches everything.

## Solution

Switched from catch-all `notio/**` to inclusion-only patterns listing code-relevant paths.

**Initial attempt** (negation patterns) failed: `dorny/paths-filter` OR's all array entries, so `!notio/docs/**` matches everything outside `notio/docs/`, making the filter always true. See [issue #184](https://github.com/dorny/paths-filter/issues/184).

**Final approach** — inclusion-only:
```yaml
notio:
  - "notio/Sources/**"
  - "notio/Tests/**"
  - "notio/Package.swift"
  - "notio/Package.resolved"
  - "notio/Dockerfile"
  - "notio/docker-compose.yml"
  - "notio/scripts/**"
  - "notio/supabase/**"
  - "notio/release.toml"
```

Trade-off: new code directories require updating the filter. But non-code paths (`docs/`, `research/`, `README.md`) no longer trigger expensive Swift builds.
