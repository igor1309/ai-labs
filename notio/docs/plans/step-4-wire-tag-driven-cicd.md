---
date: 2026-04-18
model: claude-opus-4-6
description: "Implementation plan for wiring tag-driven CI/CD for the notio service (step 4 of Initial Bring-Up Steps)."
status: draft
version: 0.0.1
---

# Step 4: Wire Tag-Driven CI/CD for the Notio Service

## Execution Lock

- Worktree required: yes
- Expected worktree: `worktrees/notio-step-4`
- Expected branch: `codex/notio-step-4`
- Preflight check: [ ] done

## ADR Traceability Matrix

| Invariant | Source | Step |
|---|---|---|
| Tag format `notio_v<version>` on trunk | ADR-005 (notio), ADR-003 (repo) | verify (existing) |
| Tests before artifact | ADR-005 (notio) | 3 |
| No deploy on red | ADR-005 (notio) | 3, 4 |
| Docker image tagged with `<version>` and `<git-sha>` | ADR-005 (notio), ADR-006 (repo) | 1, 4 |
| Build and tag locally on VPS | ADR-005 (notio), ADR-006 (repo) | 1, 4 |
| Deploy via SSH | ADR-005 (notio) | 4 |
| Verify health + version == tag | ADR-005 (notio), bring-up plan | 4 |
| Telegram notification on failure | existing pattern | 5 |

## Decisions (confirmed)

1. **Dedicated `test-notio` job** conditional on `basename == 'notio'`; skip the Node `core` job for notio tags.
2. **Build Docker on VPS** — SCP source, build locally, no registry. Per ADR-006 ("Registry publishing is deferred; current deployment builds and tags images locally on the VPS").
3. **No staging** — single deploy target for the first bring-up. Staging can be added later.
4. **ADR alignment first** — update notio ADR-005 to match the repo-level ADR-006 policy and the existing nomos release-unit deployment shape before changing the workflow plan.

## Steps

### Step 1: Align ADR-005 with the chosen deploy shape

Update `notio/docs/adr/adr-005-tag-driven-cicd-to-vps.md` so the notio release contract matches the repo-level Docker release policy and the existing nomos implementation pattern in `.github/workflows/release-unit.yml`.

- Replace the registry-based wording with the actual release shape: CI runs tests, copies deploy context to the VPS, builds and tags the Docker image locally on the VPS, deploys over SSH, then verifies health and version.
- Cite ADR-006 for `<version>` and `<git-sha>` image tags.
- Cite the existing nomos release-unit workflow as the precedent for this repo.

**Verification:** Manual doc review confirms ADR-005 is internally consistent and no longer contradicts ADR-006 or the planned notio workflow.

**Commit:** `align notio adr-005 with vps-local image build policy`

---

### Step 2: Add notio deploy script, docker-compose, and env example

Create `notio/scripts/deploy.sh`, `notio/docker-compose.yml`, and `notio/.env.example` for VPS deployment.

**`notio/docker-compose.yml`** — single service, no reverse proxy (Cloudflare Tunnel handles ingress, wired in step 5):
- Service `notio` built from Dockerfile with `VERSION` build arg
- Container name `notio`
- Restart policy `unless-stopped`
- Runtime config stays environment-driven; compose reads `.env` so `NOTIO_WEBHOOK_PATH` and future overrides come from the environment
- Publish port 8080 on host (`ports: ["8080:8080"]`) so CI can verify from host
- Logging labels

**`notio/.env.example`** — documents the required runtime environment and supports local compose validation without real secrets:
- Includes placeholder but structurally valid values for required keys, at minimum `NOTIO_WEBHOOK_PATH=test-webhook`
- May include optional documented overrides such as `NOTIO_PORT=8080`
- VPS operators copy this shape to `/opt/notio/.env` and replace placeholders before the first real deploy

**`notio/scripts/deploy.sh`** — called via SSH on VPS, expects env vars `NOTIO_VERSION` and `NOTIO_GIT_SHA`:
- Creates `/opt/notio` if missing
- Copies files from `/tmp/notio-deploy` to `/opt/notio`
- Builds Docker image with version arg: `docker build --build-arg VERSION=$NOTIO_VERSION -t notio:$NOTIO_VERSION -t notio:$NOTIO_GIT_SHA .`
- Tags current running image as `notio:rollback` before replacing
- Fails fast with a clear error if `/opt/notio/.env` is missing on the VPS
- Runs `docker compose down && docker compose up -d`
- Waits and checks health

**Verification:** Script is syntactically valid (`bash -n`), compose validates against a local copy of `.env.example` (`cp notio/.env.example notio/.env && docker compose -f notio/docker-compose.yml config`), then remove the temporary `notio/.env`.

**Commit:** `add notio deploy script and docker-compose for VPS`

---

### Step 3: Add `test-notio` job to `release-unit.yml`

Add a new job to `.github/workflows/release-unit.yml`:

```yaml
test-notio:
  if: ${{ needs.verify.outputs.basename == 'notio' }}
  needs: [verify]
  runs-on: ubuntu-latest
  timeout-minutes: 15
  container:
    image: swift:6.1
  steps:
    - name: Checkout
      uses: actions/checkout@v4
      with:
        ref: ${{ github.ref_name }}
    - name: Run tests
      working-directory: notio
      run: swift test
```

Make the existing `core` job skip notio tags:

```yaml
core:
  if: ${{ needs.verify.outputs.basename != 'notio' }}
```

**Verification:** Workflow YAML is valid (actionlint if available, otherwise manual review).

**Commit:** `add test-notio job to release-unit workflow; skip core for notio tags`

---

### Step 4: Add `deploy-notio` job to `release-unit.yml`

Add the deploy job, conditional on `basename == 'notio'`, depending on `test-notio` and `verify`:

```yaml
deploy-notio:
  if: ${{ needs.verify.outputs.basename == 'notio' }}
  needs: [test-notio, verify]
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - name: Checkout
      uses: actions/checkout@v4
      with:
        ref: ${{ github.ref_name }}

    - name: Copy source files to VPS
      uses: appleboy/scp-action@v0.1.7
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.VPS_SSH_KEY }}
        source: "notio/Dockerfile,notio/Package.swift,notio/Package.resolved,notio/Sources,notio/docker-compose.yml,notio/scripts,vendor/ci-shared/scripts/notify_telegram.sh"
        target: /tmp/notio-deploy
        strip_components: 1

    - name: Deploy on VPS
      uses: appleboy/ssh-action@v1
      env:
        NOTIO_VERSION: ${{ needs.verify.outputs.version }}
        NOTIO_GIT_SHA: ${{ github.sha }}
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.VPS_SSH_KEY }}
        envs: NOTIO_VERSION,NOTIO_GIT_SHA
        script: bash /tmp/notio-deploy/scripts/deploy.sh

    - name: Verify deployed version
      uses: appleboy/ssh-action@v1
      env:
        EXPECTED_VERSION: ${{ needs.verify.outputs.version }}
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.VPS_SSH_KEY }}
        envs: EXPECTED_VERSION
        script: |
          set -e
          RESPONSE=$(curl -sf http://127.0.0.1:8080/version)
          echo "Version response: $RESPONSE"
          echo "$RESPONSE" | grep -q "\"version\":\"${EXPECTED_VERSION}\""
          echo "Version verified: ${EXPECTED_VERSION}"

    - name: Notify deploy success
      env:
        CI_BOT_TOKEN: ${{ secrets.CI_BOT_TOKEN }}
        CI_CHAT_ID: ${{ secrets.CI_CHAT_ID }}
        EXPECTED_VERSION: ${{ needs.verify.outputs.version }}
      uses: appleboy/ssh-action@v1
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.VPS_SSH_KEY }}
        envs: CI_BOT_TOKEN,CI_CHAT_ID,EXPECTED_VERSION
        script: |
          TEXT=$(printf "✅ notio v%s deployed\nversion verified" "$EXPECTED_VERSION")
          bash /tmp/notio-deploy/ci-shared/scripts/notify_telegram.sh "$CI_BOT_TOKEN" "$CI_CHAT_ID" "$TEXT"
          rm -rf /tmp/notio-deploy
```

Notes:
- Version verification curls from the VPS host (not `docker exec`), which also validates the port mapping.
- `NOTIO_GIT_SHA` is passed from CI (`github.sha`) so the deploy script can tag the image per ADR-006 without needing a git repo on VPS.
- SCP includes `vendor/ci-shared/scripts/notify_telegram.sh`; with `strip_components: 1` it lands at `/tmp/notio-deploy/ci-shared/scripts/notify_telegram.sh`.

**Verification:** Workflow YAML is valid.

**Commit:** `add deploy-notio job to release-unit workflow`

---

### Step 5: Update `github-release` and `notify` job conditions

Update the downstream jobs to include notio:

**`github-release`** — add `deploy-notio` and `test-notio` to `needs`, update `if` condition:

```yaml
github-release:
  needs: [core, verify, test-notio, deploy-nomos-staging, deploy-nomos-prod, deploy-notio]
  if: >-
    ${{ always() && !cancelled()
    && needs.verify.result == 'success'
    && (needs.core.result == 'success' || needs.core.result == 'skipped')
    && (needs.test-notio.result == 'success' || needs.test-notio.result == 'skipped')
    && needs.deploy-nomos-staging.result != 'failure'
    && needs.deploy-nomos-prod.result != 'failure'
    && needs.deploy-notio.result != 'failure'
    }}
```

**`notify`** — add `deploy-notio` and `test-notio` to `needs` and `if` condition, and to `job_results`:

```yaml
notify:
  needs: [verify, core, test-notio, deploy-nomos-staging, deploy-nomos-prod, deploy-notio, github-release]
  if: >-
    ${{ always() && !cancelled()
    && (needs.verify.result == 'failure'
    || needs.core.result == 'failure'
    || needs.test-notio.result == 'failure'
    || needs.deploy-nomos-staging.result == 'failure'
    || needs.deploy-nomos-prod.result == 'failure'
    || needs.deploy-notio.result == 'failure'
    || needs.github-release.result == 'failure')
    }}
  with:
    job_results: |
      verify=${{ needs.verify.result }}
      core=${{ needs.core.result }}
      test-notio=${{ needs.test-notio.result }}
      deploy-nomos-staging=${{ needs.deploy-nomos-staging.result }}
      deploy-nomos-prod=${{ needs.deploy-nomos-prod.result }}
      deploy-notio=${{ needs.deploy-notio.result }}
      github-release=${{ needs.github-release.result }}
```

**Verification:** Workflow YAML is valid.

**Commit:** `update github-release and notify jobs for notio support`

---

## Final Gates

- [ ] Workflow YAML validates (actionlint or manual review)
- [ ] `swift test` passes locally for notio
- [ ] All changed files are scoped to: `notio/docs/adr/adr-005-tag-driven-cicd-to-vps.md`, `notio/scripts/`, `notio/docker-compose.yml`, `notio/.env.example`, `.github/workflows/release-unit.yml`
- [ ] Plan moved to `notio/docs/plans/implemented/`
- [ ] Log updated
- [ ] PR created against trunk

## Open Questions

1. **VPS directory** — Deploy target is `/opt/notio`. The deploy script creates it if missing (`mkdir -p`).
2. **Runtime env ownership** — Step 4 should document the required env shape in `notio/.env.example`, but the real `/opt/notio/.env` on the VPS must still be provisioned before the first deploy because `NOTIO_WEBHOOK_PATH` is required at runtime.

## Not in Scope

- Cloudflare Tunnel configuration (step 5 of bring-up)
- Staging environment
- Rollback automation
- Registry publishing
- Secret management details
- Telegram bot setup (step 10 of bring-up)
