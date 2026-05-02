---
date: 2026-05-02
model: claude-opus-4-7
description: "clipdeck project README — overview and local preview workflow"
---

# clipdeck

iPhone-friendly private webpage that copies prompts and skills from `igor1309/ai-labs` with one tap. The backend strips YAML front matter server-side; the client never sees raw GitHub responses.

## Local preview

```bash
cd clipdeck
npm run preview
```

Open `http://localhost:8000`. The mock server stubs `GET /api/items` so the populated library is reachable without a GitHub PAT.

## Tests and types

```bash
npm test
npm run typecheck
```

## Docs

See [`docs/`](docs/) for ADRs, specs, and implementation plans.
