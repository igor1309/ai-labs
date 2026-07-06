---
date: 2026-07-06
model: gpt-5
description: "Forward task: make FolioTell distributable through TestFlight on the correct Apple team."
version: 0.0.1
---

# Backlog — FolioTell TestFlight

## Distribute FolioTell through TestFlight on VRVJ9YNRQU

Prepare a real TestFlight release path for FolioTell without mixing Apple
Developer or App Store Connect teams.

- Use only Apple team/provider `VRVJ9YNRQU` for App Store Connect, signing,
  provisioning, archive export, and upload.
- Add an archive-ready iOS app project or equivalent release packaging path; the
  current Swift package simulator wrapper is not a TestFlight artifact.
- Configure distribution signing and provisioning for bundle identifier
  `foliotell.FolioTell` under `VRVJ9YNRQU`.
- Add App Store Connect authentication for the same provider, preferably via a
  scoped API key secret rather than an interactive account session.
- Add a repeatable upload command or CI/manual release workflow that fails if
  the selected provider/team is not `VRVJ9YNRQU`.
- Verify the produced archive uploads to TestFlight and is visible under the
  intended App Store Connect team before inviting testers.
