---
name: release-process
description: Per-unit release policy, invariants, and verification gates for ai-labs
trigger: when performing a release, tagging, bumping versions, or working with release-unit infrastructure
---

# Release Process

Release policy is outcome-based, per-unit, and governed by ADR-000 through ADR-006 (`docs/adr/release/`). Commands are implementation detail; these invariants are mandatory.

## Per-unit release model

- **Release units** are independently versioned and released. Units are declared in `release-units.config.toml` and tracked in the committed manifest `release-units.toml`.
- **Discovery**: `release-units.config.toml` lists directory prefixes eligible for release-unit discovery. The generator (`scripts/release/generate-manifest.js`) produces the committed manifest. CI fails if the manifest drifts. A local pre-commit hook (`.git/hooks/pre-commit`) auto-regenerates and stages `release-units.toml` whenever any `release.toml` is staged, so manifest drift cannot be committed.
- **Canonical version**: Node units use `package.json`; non-Node units use `release.toml`. A unit MUST NOT contain both. Versions follow semver.
- **Tagging**: per-unit tags follow `<basename>_v<version>` (e.g., `nomos_v0.6.0`). Basename is the leaf directory name, must be globally unique, and must not contain underscores.
- **Release detection**: a release occurs only when **both** files under the unit root changed **and** the canonical version changed since the last matching tag (`<basename>_v*`). No tag → base is the initial commit.
- **Trunk-only**: releases trigger only on push to `trunk`. Release branches are prohibited.
- **Docker units**: Docker-producing units (marked in manifest) define two image tags: `<version>` and `<git-sha>`. Registry publishing is deferred; images are built and tagged locally on the VPS.

## Release invariants

- **Start state**: release from `trunk`.
- **SemVer decision**: choose release bump per SemVer 2.0 from the delta since the previous unit tag (or full history on first release).
- **Release notes**: add exactly one new top entry in the release-scope log (`docs/log.md` for repo-level releases, `<project>/docs/log.md` for project releases) at the top of the current date section, if present, scoped to that reviewed delta.
- **Version consistency**: canonical version in the unit's metadata file and the release tag `<basename>_v<version>` must match.
- **Push safety**: push only `trunk` and the explicit release tag; never `git push --tags`.
- **Pre-push gate**: run the release unit's required build and test verification before tagging.
  - Node/TypeScript units or root-suite integration releases: `./scripts/run_silent.sh "build" npx tsc --noEmit` and `./scripts/run_silent.sh "tests" npm test`
  - Swift-only units: native verification such as `swift build` and `swift test`
- **Deployment gate**: releases deploy via CI on tag push after tests pass.
- **Post-push verification**: after pushing the tag, watch the Release Unit workflow with `gh run list` or `gh run watch`. Confirm CI and release-unit jobs pass before declaring the release complete.
- **CI trigger**: `.github/workflows/release-unit.yml` is a post-tag pipeline that verifies, tests, and deploys. Release detection (`detect-releases.js`) and tag creation (`create-tags.js`) are operator-run scripts.
- **Legacy coexistence**: the existing `v*` tag namespace (`.github/workflows/release.yml`, Oracle-specific) coexists with the new `<basename>_v*` namespace. The legacy workflow is not modified; migration is deferred.
- **Smoke model**: the real-provider smoke gate uses `vars.OPENROUTER_CI_MODEL` and `secrets.OPENROUTER_API_KEY`.
