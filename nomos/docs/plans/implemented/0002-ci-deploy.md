---
date: 2026-02-27
model: claude-opus-4-6
description: "Implementation plan for Nomos CI/CD deploy via SSH"
---

# Plan: Nomos CI/CD Deploy via SSH

Source: ADR-0002 (CI/CD Deployment via SSH)
Worktree required: no
Expected branch: trunk

## Steps

### Step 1: Add GitHub secrets

Add the following secrets to the `igor1309/ai-labs` repository:

- `VPS_HOST` — `95.164.53.144`
- `VPS_USER` — `root`
- `VPS_SSH_KEY` — contents of the SSH private key that authenticates to the VPS

Use `gh secret set` to configure each.

Gate: `gh secret list` shows all three secrets.

- [ ] done

### Step 2: Prepare VPS source directory

Create `/opt/nomos/repo/` on the VPS to hold source files for rebuilds. This separates source (replaceable by CI) from config (`.env`, `Caddyfile` — operator-managed).

Gate: directory exists on VPS.

- [ ] done

### Step 3: Add deploy job to release-unit.yml

Add a `deploy` job to `.github/workflows/release-unit.yml`:

- Condition: `needs.verify.outputs.basename == 'nomos'`
- Depends on: `core`
- Uses: `appleboy/ssh-action@v1` with `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- Script:
  1. `cd /opt/nomos`
  2. Copy source files from repo checkout to VPS (or clone/pull on VPS)
  3. `docker build -t nomos:latest .`
  4. `docker compose down && docker compose up -d`
  5. Wait for container health, then `curl -fsS http://localhost:8080/health` from inside the nomos container
- Make `github-release` depend on `deploy` when it runs.

Approach for source files: use `appleboy/scp-action` to transfer Dockerfile, package.json, package-lock.json, and src/ from the CI runner to VPS `/opt/nomos/`, then build. This avoids needing git credentials on the VPS.

Gate: workflow file is valid YAML, passes `actionlint` or similar.

- [ ] done

### Step 4: Update notify job

Ensure the `notify` job includes `deploy` in its failure condition and job results.

Gate: notify job references deploy result.

- [ ] done

### Step 5: Test with a release

Bump `nomos/package.json` version to `0.6.1`, commit, tag `nomos_v0.6.1`, push.

Gate: `gh run list` shows Release Unit workflow passes all jobs including deploy. Health check on `https://nomos.enoa.ai/health` returns ok.

- [ ] done

### Step 6: Update logs

Update `nomos/docs/log.md` and `docs/log.md`.

- [ ] done
