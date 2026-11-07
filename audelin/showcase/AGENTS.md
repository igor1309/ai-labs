# Publishing Audelin

The public README is written for visitors. Keep personal call context,
internal tools and future integrations out. Only explicitly allowlisted
committed code and tests cross into the public repository. Private docs,
research, spikes, agent settings and this directory's tooling stay private.
Keep font license files and audio test fixtures with their targets.

The allowlist includes both Swift packages, preview code required by source checks, their resource files, the app
icon and entitlements, and `macos/scripts/bundle.sh`. The module checker
mentioned in the original publication brief no longer exists; both package
builds and test suites are the standalone export check.

Retake screenshots from the repository root:

```sh
swift run --package-path audelin/showcase/capture Capture "$PWD/audelin/showcase/public/screenshots"
```

This renders the production PanelView in a native window, using synthetic
Russian conversation text with English terms. It records no audio. Inspect
both PNGs after capture. Rewrite the README when features, requirements or
setup instructions change. Have the owner approve the README and every
screenshot before merging the showcase PR.

After merge, from a clean checkout of origin/trunk:

```sh
node scripts/showcase/export.js audelin
node scripts/showcase/export.js audelin --push
```

The dry run scans for secrets and private markers, then builds and tests
both packages. Inspect the resulting snapshot. The exporter requires Node
with path.matchesGlob, gitleaks, git, macOS 26 and Xcode 26. Push also needs
authenticated gh and an existing public repository. Before creating that
repository, obtain the owner's explicit instruction to create
igor1309/audelin. After publishing, clone it fresh and repeat the README's
build and test commands. Pinning and the profile entry are separate work.
