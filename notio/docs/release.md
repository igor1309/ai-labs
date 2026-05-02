---
date: 2026-04-24
model: gpt-5
description: "Notio backend and frontend release checklist"
---

# Notio Release Checklist

## Release Units

- Backend releases use `notio-backend_v<version>` and deploy the Swift/Hummingbird Docker service from `notio/backend/`.
- Frontend releases use `notio-frontend_v<version>` and deploy the Svelte/Vite Cloudflare Pages app from `notio/frontend/`.
- Historical `notio_v<version>` tags are pre-split backend releases only.

## Frontend Compatibility

Frontend release PRs must answer:

- Does this frontend release require a minimum backend release?
- If yes, name the exact minimum compatible backend tag, for example `notio-backend_v0.3.0`.

Name the same backend tag in `notio/docs/log.md` whenever a frontend change depends on a backend schema or read-contract change.
