---
date: 2026-04-24
model: gpt-5
description: "To-do list for hardening the notio backend deploy path"
---

# Notio Backend Deploy To-Do

## Context

Manual backend deploy was useful for the first production test, but routine releases should stay on the tag-driven release-unit path.
The current backend deploy already runs through `.github/workflows/release-unit.yml` for `notio_v<version>` tags, builds the Docker image on the VPS, and verifies the running `/version` response.

## To-Do

- Add rollback-on-failure for the `deploy-notio` job. The deploy script already tags the previous image as `notio:rollback`; CI should call a dedicated rollback script if deploy or version verification fails.
- Consider a later `deploy-notio-staging` -> `deploy-notio-prod` split, following the Nomos release pattern. Start with a lightweight staging container using diagnostic mode before adding a second full Telegram integration.
- Keep `Tests/` in every backend deploy layer: SCP source list, deploy script copy/cleanup, `.dockerignore`, and Docker build context. SwiftPM 6.1 needs the test target directory even when building only `NotioServer`.
- Keep runtime verification as the release success condition. Container restart is insufficient; CI must prove the deployed service reports the expected release version.

## Acceptance Checks

- Failed production deploy restores the previous `notio:rollback` image when one exists.
- Release notification distinguishes deploy success from rollback success or rollback absence.
- Backend deploy documentation and gotchas stay aligned with the workflow and scripts.
