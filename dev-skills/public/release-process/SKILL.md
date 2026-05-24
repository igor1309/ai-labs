---
name: release-process
author: Igor Malyarov
version: "1.0.0"
description: Per-unit release discipline — model, invariants, and verification gates
trigger: when performing a release, tagging, bumping versions, or working with release-unit infrastructure
---

# Release Process

Release policy is outcome-based and per-unit. Commands are implementation detail; these invariants are mandatory.

## Per-unit release model

- **Release units** are independently versioned and released. Units are declared in a config file and tracked in a committed manifest.
- **Discovery**: a config file lists directory prefixes eligible for release-unit discovery. A generator produces the committed manifest. CI fails if the manifest drifts. A local pre-commit hook auto-regenerates and stages the manifest whenever a unit's version file is staged, so drift cannot be committed.
- **Canonical version**: Node units use `package.json`; non-Node units use `release.toml`. A unit MUST NOT contain both. Versions follow semver.
- **Tagging**: per-unit tags follow `<basename>_v<version>` (e.g., `nomos_v0.6.0`). Basename is the leaf directory name, must be globally unique, and must not contain underscores.
- **Release detection**: a release occurs only when **both** files under the unit root changed **and** the canonical version changed since the last matching tag (`<basename>_v*`). No tag → base is the initial commit.
- **Trunk-only**: releases trigger only on push to the main branch. Release branches are prohibited.
- **Docker units**: Docker-producing units (marked in manifest) define two image tags: `<version>` and `<git-sha>`.

## Release invariants

- **Start state**: release from the main branch.
- **SemVer decision**: choose release bump per SemVer 2.0 from the delta since the previous unit tag (or full history on first release).
- **Release notes**: add exactly one new top entry in the release-scope log at the top of the current date section, scoped to the reviewed delta.
- **Version consistency**: canonical version in the unit's metadata file and the release tag `<basename>_v<version>` must match.
- **Push safety**: push only the main branch and the explicit release tag; never `git push --tags`.
- **Pre-push gate**: run the release unit's required build and test verification before tagging.
  - Node/TypeScript units: build check + test suite
  - Swift-only units: `swift build` and `swift test`
- **Deployment gate**: releases deploy via CI on tag push after tests pass.
- **Post-push verification**: after pushing the tag, confirm CI and release-unit jobs pass before declaring the release complete.

## Completion verification

After a release is declared complete, verify against the invariants above:

- [ ] Release was cut from the main branch (not a feature or release branch).
- [ ] SemVer bump matches the scope of changes since the previous tag.
- [ ] Release notes added to the release-scope log, scoped to the reviewed delta.
- [ ] Canonical version in metadata file matches the release tag `<basename>_v<version>`.
- [ ] Only the main branch and the explicit release tag were pushed (no `--tags`).
- [ ] Build and test verification passed before tagging.
- [ ] CI and release-unit jobs passed after tag push.
- [ ] For Docker units: image tags include both `<version>` and `<git-sha>`.
