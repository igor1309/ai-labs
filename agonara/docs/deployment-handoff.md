---
date: 2026-06-06
title: agonara-deployment-handoff
description: "Handoff for deploying Agonara to agonara-vps via the repo's per-unit tag-release approach."
version: 0.2.0
---

# Agonara Deployment Handoff

Handoff for standing up Agonara deployment on a dedicated VPS (**agonara-vps**)
using this repo's **per-unit tag-release** machinery (ADR-000..006,
`release-units.config.toml` / `release-units.toml`, `.github/workflows/release-unit.yml`).

The closest existing analog is **nomos** (Node, Docker, VPS, staging→prod). This
handoff models Agonara on the nomos deploy path and calls out where Agonara
differs. Decisions confirmed with the owner:

- **Topology:** staging + prod, both tiers on agonara-vps.
- **Image delivery:** build-on-VPS (the nomos pattern). Confirmed.
- **HTTPS / domain:** staging is live at
  `https://staging.agonara.enoa.ai`; prod is deployed internally on loopback
  and prod hostname/public TLS remain undecided.
- **LLM provider:** wire a real provider for staging/prod by pointing Agonara's
  evaluator/curation provider adapter (ADR-015) at the repo's **Nomos** gateway,
  with Agonara's **own Nomos project + API key** (per the CLAUDE.md "Nomos API
  Keys" rule), and a real-LLM deploy smoke following the nomos pattern. That
  adapter does **not exist yet** and must be built — see
  [§6b](#6b-real-llm-provider-for-the-evaluatorcuration-path-gated-by-g2).
- **Note location:** here, under `agonara/docs/`.

> **This handoff is not "ops only."** Most of the work is deployment wiring
> (new config, scripts, CI jobs, VPS data + keys — [§7](#7-opsworkflow-checklist-deployment-wiring)),
> but two threads require **net-new Agonara application code**
> ([§6](#6-application-development-required-pre-deploy)), and one of those is
> blocked on ADR/spec decisions that do not yet exist
> ([§5](#5-blocking-prerequisites-adrspec-gates)). The first-release runbook
> ([§9](#9-first-release-runbook)) is **not executable** until §5 and §6 close.
>
> Open decisions are listed in [§10 Open questions](#10-open-questions).

## 0. Resolution status (2026-06-06)

The missing My Way artifacts this handoff implied have been produced on
`claude/agonara-handoff-gaps-tndEi`:

- **G1** closed by [ADR-017 — Private-Instance Deployment Operational Boundary](adr/adr-017-private-instance-deployment-operational-boundary.md)
  (also folds in **G3** backup/restore minimums). `deployment-target.md` now points to it.
- **G2** closed by [ADR-018 — Open-Answer Evaluator Real-Provider Runtime](adr/adr-018-open-answer-evaluator-real-provider-runtime.md)
  (amends ADR-015), with the implementable contract in
  [Open-Answer Evaluator Real-Provider Runtime](specs/open-answer-evaluator-real-provider-runtime.md) (implemented).
- **§6a** version surfacing is **implemented** (health now returns `version`,
  sourced from `package.json`; covered by tests and the container smoke) under
  [Operations Health Version](specs/operations-health-version.md).
- **§6b** open-answer evaluator real-provider runtime is **implemented**:
  Nomos adapter, LLM evaluator policy, async-compatible worker execution,
  single-flight operational trigger, and env-only composition-root wiring.
- **§7** deployment work remains sequenced by the [Agonara Deployment Wiring](plans/agonara-deployment-wiring.md)
  implementation plan (release-unit registration → VPS scaffolding → CI deploy jobs → gated real-LLM smoke).

The remaining work is deployment execution plus human-owned inputs (prod
hostname, secrets, dedicated Nomos project/key/model selection) and the
still-open operational questions in [§10](#10-open-questions).

## 1. Current state

| Aspect | Status |
| --- | --- |
| Code | `agonara/` Node workspace, `type: module`, `engines.node >= 22`, dep `better-sqlite3` |
| Version | `agonara/package.json` → `0.0.0` (**not yet a real release version**) |
| Release unit | **Not registered.** Absent from `release-units.config.toml` and `release-units.toml` |
| CI (core) | `.github/workflows/agonara-core.yml` exists — tests + `docker build` + container smoke (`/operations/health`, bootstrap, admin UI) |
| Container | `agonara/Dockerfile` (node:22-slim, non-root, `/data` sqlite volume, `HEALTHCHECK` on `/operations/health`, `EXPOSE 8080`) |
| Compose | `agonara/compose.yaml` for local/dev plus `compose.staging.yml` / `compose.prod.yml` for VPS staging/prod; staging binds `127.0.0.1:18081:8080`, prod binds `127.0.0.1:18080:8080`, each with distinct named volumes and host-side env files |
| Deploy job | **None.** No agonara branch in `release-unit.yml` |
| Deploy scripts | `agonara/scripts/deploy-staging.sh`, `deploy-prod.sh`, `rollback-prod.sh`, `backup-staging.sh`, `restore-staging.sh`, `backup-prod.sh`, `restore-prod.sh` exist; CI release jobs are not wired yet |
| Staging/prod compose | Present. Staging is live on `root@172.245.246.108`: `agonara-staging` healthy on loopback `127.0.0.1:18081`, health returns version `0.0.0`, Caddy serves `https://staging.agonara.enoa.ai/operations/health`, a real open-answer evaluator smoke passed through the operations trigger and dedicated Nomos staging project, and staging `/data` backup/restore has been rehearsed from off-host storage. Prod is deployed internally as `agonara`, loopback-bound on `127.0.0.1:18080`, with distinct prod env secrets, a dedicated Nomos prod project/key, real evaluator smoke, daily off-host backup cron, and a restore drill from the downloaded off-host artifact. No prod public hostname/TLS route or CI release job yet |
| Health/version | `/operations/health` returns `{status, version, checkedAt, requestId}` — version sourced from `package.json` (§6a, implemented) |
| LLM evaluation (runtime) | Open-answer evaluator real-provider runtime exists (§6b implemented). Staging has `AGONARA_NOMOS_BASE_URL=https://staging.nomos.enoa.ai`, model `openai/gpt-5-nano`, and a dedicated Nomos staging project/key. Prod has `AGONARA_NOMOS_BASE_URL=https://nomos.enoa.ai`, model `openai/gpt-5-nano`, and a dedicated Nomos prod project/key. The smoke script `scripts/smoke-open-answer-evaluator.mjs` schedules one exact evaluator job, triggers `/operations/open-answer-evaluator/tick`, and verifies the attempt detail contains an evaluation. Curator-suggestion real-provider migration remains out of scope. |
| VPS secrets | Staging and prod bootstrap, operations trigger, Nomos base URL/model/key, smoke-admin credentials, and backup SSH keys are provisioned host-side with restrictive file modes; Agonara-specific GitHub deploy secrets and public-prod smoke token are not provisioned yet |

## 2. How the repo's tag-release approach works (recap)

Mandatory invariants live in the `release-process` skill and
`.agents/release-process.md`. The mechanics:

1. **Declare the unit** in `release-units.config.toml` (`paths = [..., "agonara"]`).
   Basename = leaf dir `agonara` (globally unique, no underscores — ✅).
2. **Manifest** `release-units.toml` is auto-generated by
   `scripts/release/generate-manifest.js`. A local pre-commit hook regenerates
   and stages it when a unit's version file is staged; CI fails on drift.
   Agonara will land as a Node unit (`metadata = package.json`) with
   `docker = true` (Dockerfile present).
3. **Canonical version** = `agonara/package.json` `version` (semver). Must NOT
   also have a `release.toml`.
4. **Cut a release** from **trunk only**: bump the version, add one release-scope
   log entry, push trunk + the explicit tag `agonara_v<version>`
   (e.g. `agonara_v0.1.0`). Never `git push --tags`.
5. **Release detection**: a release fires only when files under `agonara/`
   changed **and** the version changed since the last `agonara_v*` tag.
6. **`release-unit.yml`** triggers on `*_v*`:
   `verify` (parse tag, validate against manifest, assert tag commit is an
   ancestor of `origin/trunk`) → `core` (full `npm test` + `tsc --noEmit`) →
   **unit-specific deploy job** → `github-release`. A `notify` job posts Telegram
   on any failure.
7. **Docker units** are expected to carry two image tags: `<version>` and
   `<git-sha>`.

The deployment-wiring work in this handoff is steps 1–3 (register + version)
plus adding the Agonara deploy job and its VPS-side scaffolding (the parts that
don't exist) — see [§7](#7-opsworkflow-checklist-deployment-wiring). It also
requires the application work in [§6](#6-application-development-required-pre-deploy),
which the deploy verify/smoke steps depend on.

## 3. Target topology — agonara-vps

- **One dedicated VPS: agonara-vps.** Owner chose **staging + prod**, so both
  tiers run on agonara-vps as separate containers on distinct ports — mirroring
  nomos (`nomos-staging` on `:8081`, `nomos` prod on `:8080`).
  - Suggested: `agonara-staging` → host loopback `:18081`, `agonara` prod →
    `:18080` (current compose port). Final ports TBD with reverse-proxy layout.
- Agonara binds **loopback only**; external web/API access needs a reverse proxy
  (Caddy/nginx) terminating TLS in front of each container. **HTTPS + domain are
  in scope for v1**, so the reverse proxy + TLS + DNS are part of the first
  deployment, not a later add-on. Suggest distinct hostnames per tier
  (e.g. `staging.<domain>` and `<domain>`).
- Deploy dir convention (nomos uses `/opt/nomos`): suggest `/opt/agonara` with
  `staging/` and `prod/` subdirs or per-tier compose files.

## 4. Image delivery — decided: build-on-VPS

**Confirmed: build-on-VPS (the nomos pattern) for v1.** Move to a registry only
if a concrete trigger appears later.

**Why build-on-VPS for the first release**
- It is the established, working repo pattern (nomos and notio-backend both
  build on the VPS after an `scp` of source; nomos uses `docker compose up -d
  --build`). No new infrastructure, no registry account, no extra credentials.
- Agonara's image is tiny and cheap to build (node:22-slim + `npm install
  --omit=dev` over one runtime dep), so on-VPS build cost is negligible.
- Keeps the private-instance ownership story clean — nothing leaves agonara-vps.
- Rollback is local and simple (snapshot the prior image tag, as
  `nomos/scripts/deploy-prod.sh` / `rollback-prod.sh` do).

**Cost / caveat**
- The `<version>` + `<git-sha>` image-tag invariant must be applied **locally on
  agonara-vps** in the deploy script (tag the freshly built image with both),
  since nothing is pushed to a registry.
- Build happens on the production host; acceptable here given image size, but it
  does couple build and run on one box.

**Revisit a registry (e.g. GHCR) when** any of these become true: more than one
host needs the same image, on-VPS build contention shows up, or you need signed/
immutable image provenance. At that point CI builds + pushes `<version>` and
`<git-sha>`, and agonara-vps pulls instead of builds.

## 5. Blocking prerequisites (ADR/spec gates)

These are **decisions, not tasks** — they must be ratified before the §6
application work is built and before the §9 runbook is executable. They are
ADR/spec-level because the existing accepted ADRs/specs explicitly defer them.

- [x] **G1 Deployment ADR (deployment-target → accepted).** Closed by
      [ADR-017](adr/adr-017-private-instance-deployment-operational-boundary.md).
      `agonara/docs/deployment-target.md` is provisional: it "becomes a
      commitment only after an ADR accepts the operational boundary,
      backup/restore expectations, and minimum admin responsibilities." No such
      ADR exists. Promote it before declaring a prod release real. **Gates:**
      HTTPS/domain ownership, backup/restore minimums, admin operational
      responsibility.
- [x] **G2 Evaluator worker execution + real-provider spec (amends/extends
      ADR-015 scope).** Closed by [ADR-018](adr/adr-018-open-answer-evaluator-real-provider-runtime.md)
      (amends ADR-015) and the [real-provider runtime spec](specs/open-answer-evaluator-real-provider-runtime.md).
      ADR-015 and `docs/specs/student-workspace-open-answer-evaluator-worker.md`
      define an **in-process, single-run** worker that receives **deterministic
      adapter output** and explicitly list *external provider calls, deployment
      topology, and worker topology assumptions* as non-goals. A real Nomos
      evaluation path therefore needs a new spec (and an ADR-015 amendment if it
      changes the boundary) deciding:
      - **Worker runtime topology** — in-process loop, separate process, cron,
        durable queue, or external runner (ADR-015 lists this as undecided).
      - **Output schema + validation** for real model output. ADR-015 defers
        "concrete output schema beyond requiring later specs to define and
        validate one," and wants that validation reviewable "before provider
        calls are implemented."
      - **Raw-artifact retention/redaction policy** — ADR-015: "Until a later
        spec defines that artifact policy, raw evaluator artifacts MUST NOT be
        persisted…"; a real-LLM smoke produces real transcripts that touch this.
      - **Provider credential mechanism** at the composition root (env-only,
        never in domain records — already constrained by ADR-015).
- [x] **G3 Backup/restore of the `/data` SQLite volume.** Decided in
      [ADR-017](adr/adr-017-private-instance-deployment-operational-boundary.md)
      (≥ daily off-host backup + rehearsed restore drill before prod is real). deployment-target
      gates this "before prod is declared real." Decide minimum viable
      backup + a restore drill, cadence, and storage location (see
      [§10](#10-open-questions) Q4). ADR/operational-boundary level.

> Until G1–G3 are settled, a **staging-only** first deployment that omits
> the real-LLM evaluation smoke is possible (health + version + bootstrap +
> admin UI), but a **prod** release and the real-Nomos smoke are blocked.

## 6. Application development required (pre-deploy)

Net-new Agonara **code** the deploy verify/smoke steps depend on. This is *not*
config — it is feature work in `src/`, with tests, behind the §5 gates where noted.

### 6a. Expose deployed version (prerequisite for the deploy verify step) — **done**
- [x] Add the running version to `/operations/health` so the deploy job can
      assert the live version like nomos does (`grep '"version":"<expected>"'`).
      Health now returns `{status, version, checkedAt, requestId}`; the version is
      sourced from `package.json` at runtime via the composition root
      (`startServer` → `createServer`). See
      [Operations Health Version](specs/operations-health-version.md).
- [x] Extend `agonara-core.yml` smoke + unit tests to cover the version field.
- **Size:** small, self-contained. **Not gated** by §5. **Implemented.**

### 6b. Real LLM provider for the evaluator path (done)
G2 is closed by [ADR-018](adr/adr-018-open-answer-evaluator-real-provider-runtime.md)
and the [real-provider runtime spec](specs/open-answer-evaluator-real-provider-runtime.md),
which define the contract now implemented in `src/open-answer-evaluator-runtime.js`,
`src/student-workspace.js`, and `src/server.js`:
- [x] **A real provider adapter** (OpenAI-compatible HTTP client to the Nomos
      gateway) with injected `fetch` tests and credential-free returned values.
- [x] **An evaluator policy** referencing that adapter's `providerAdapterId`,
      plus output validation for untrusted model output.
- [x] **Worker runtime wiring** — async-compatible `runOpenAnswerEvaluatorWorkerOnce`
      execution and an authenticated, single-flight operational trigger.
- [x] **Composition-root wiring** to inject the adapter + Nomos base URL/model +
      `AGONARA_NOMOS_API_KEY` from runtime env only when all provider config is present.
- [ ] (If the same real provider is also wanted for the **curator-suggestion**
      path, note that path is likewise stub-only today —
      `docs/specs/llm-assisted-curation-suggestions.md`: "uses deterministic
      provider fakes … before any real provider configuration exists.")
- **Deployment note:** the deploy smoke can now drive the operational trigger once
  a dedicated Nomos project/key/model and VPS secrets are provisioned.

## 7. Ops/workflow checklist (deployment wiring)

This is the "new config + data + keys for agonara-vps" portion — no Agonara
application code, modeled on nomos. Independent of §6 except where the deploy
job invokes the §6 features (version verify, real-LLM smoke).

### 7a. Register Agonara as a release unit
- [ ] Add `"agonara"` to `paths` in `release-units.config.toml`.
- [ ] Regenerate `release-units.toml` (`node scripts/release/generate-manifest.js`)
      — expect a new `agonara` entry with `docker = true`.
- [ ] Set an initial real version in `agonara/package.json` (e.g. `0.1.0`;
      `0.0.0` is a placeholder). Keep `private: true` — fine, nomos is `private`
      too; release uses tags, not `npm publish`.

### 7b. VPS-side scaffolding (model on nomos)
- [x] `agonara/compose.staging.yml` and `agonara/compose.prod.yml` (or one
      parameterized compose) — distinct container names + ports, named volumes
      `agonara-staging-data` / `agonara-data`, `AGONARA_BOOTSTRAP_SECRET` and the
      Nomos adapter env from env, healthcheck retained.
- [x] `agonara/scripts/deploy-staging.sh`, `deploy-prod.sh`, `rollback-prod.sh`
      mirroring `nomos/scripts/*` (build, up, snapshot prior image as
      `…:rollback`, health-gate). Apply the `<version>`+`<git-sha>` local tags here.
- [x] One-time staging agonara-vps prep: install Docker + compose, create
      `/opt/agonara`, provision Caddy + TLS for
      `https://staging.agonara.enoa.ai`, and store
      `AGONARA_BOOTSTRAP_SECRET` securely on the host (never in the repo).
      Prod hostname/TLS remains a prod closeout item.
- [x] `agonara/scripts/backup-prod.sh` and `restore-prod.sh` scaffold the
      off-host production `/data` backup and restore-drill mechanics; the actual
      `AGONARA_BACKUP_REMOTE` target and a successful drill remain human/VPS
      closeout work before prod is declared real.

### 7c. CI deploy job in `release-unit.yml`
- [ ] Add `deploy-agonara-staging` (needs `[core, verify]`,
      `if: basename == 'agonara'`): `scp` source to agonara-vps, run
      `deploy-staging.sh`, verify version via health (**needs §6a**), run staging
      smoke (incl. the real-LLM evaluation smoke once **§6b** lands).
- [ ] Add `deploy-agonara-prod` (needs `[deploy-agonara-staging, verify]`):
      run `deploy-prod.sh`, verify version, prod smoke, Telegram notify on
      success, rollback on `failure()`.
- [ ] Wire both jobs into the `github-release` `needs`/`if` guards and the
      `notify` job's `needs` + `job_results` (so a deploy failure both blocks the
      GitHub release and pages Telegram).
- [ ] **Nomos provider runtime config (data + key, not code).** The §6b adapter
      reads its config from runtime env: Nomos base URL, model, and
      `AGONARA_NOMOS_API_KEY`. Per the CLAUDE.md "Nomos API Keys" rule, provision
      Agonara's **own Nomos project + API key** — do not reuse another project's
      key. Deliver this to agonara-vps as runtime env, never committed. The
      staging/prod smoke should exercise a real evaluation path that routes
      through Nomos (mirroring the nomos real-LLM smoke), in addition to
      health + version — **once §6b exists and G2 is settled**.
- [ ] Add repo secrets: `AGONARA_VPS_HOST`, `AGONARA_VPS_USER`,
      `AGONARA_VPS_SSH_KEY`, `AGONARA_NOMOS_API_KEY` (Agonara's dedicated Nomos
      key), and an evaluation smoke token for the authed route. (`CI_BOT_TOKEN` /
      `CI_CHAT_ID` already exist.)

### 7d. Docs / governance
- [ ] Promote `agonara/docs/deployment-target.md` into the **ADR** described in
      [§5](#5-blocking-prerequisites-adrspec-gates) (G1).
- [ ] Log the change set in `agonara/docs/log.md` (and repo `docs/log.md` if the
      release-unit/CI wiring counts as repo-wide).
- [ ] README Components table already lists agonara — no row change needed unless
      status columns are added.

## 8. Verification gates (before tagging)

Per `.agents/process-gates.md` and the release skill, from trunk:
- [ ] `./scripts/run_silent.sh "tests" npm test`
- [ ] `./scripts/run_silent.sh "build" npx tsc --noEmit`
- [ ] Local Docker verification (required for Docker-producing changes, per
      `deployment-target.md`): `docker build` agonara, container start, health
      check on `/operations/health`, structured-log check, no worktree-only bind
      mounts.
- [ ] Manifest is in sync (pre-commit hook / `validate-manifest.js`).

## 9. First-release runbook

**Prerequisites — do not start until these are true:**
- §5 gates ratified (G1 deployment ADR; G2 evaluator runtime/spec **if** the
  first release includes the real-LLM path; G3 backup/restore before prod).
- §6 application code merged on trunk (6a version surfacing always; 6b real
  provider **if** the first release includes the real-LLM path).
- §7 wiring (release unit, scaffolding, CI deploy job, secrets) in place.

Then, from **trunk**:

1. Bump `agonara/package.json` → `0.1.0`, add one `agonara/docs/log.md` release
   entry, regenerate manifest.
2. Run the §8 gates.
3. Push trunk, then push the tag `agonara_v0.1.0` (only that tag — no `--tags`).
4. `release-unit.yml`: `verify` → `core` → `deploy-agonara-staging` →
   `deploy-agonara-prod` → `github-release`.
5. Post-push: confirm all jobs green and the GitHub release `agonara v0.1.0` exists.

> If G2/6b are deferred, a **staging-only** v0.1.0 without the real-LLM smoke
> is the reduced-scope path; prod and the Nomos smoke follow once those close.

## 10. Open questions

Decided by the owner (recorded in the intro): topology (staging + prod on
agonara-vps), image delivery (build-on-VPS), HTTPS + domain in scope for v1, and
a real LLM provider via the Nomos gateway (Agonara's own Nomos project + key).
Still open:

1. **Prod domain / DNS / TLS ownership** — staging is
   `https://staging.agonara.enoa.ai` through Caddy auto-TLS on the Agonara VPS;
   the prod hostname, DNS ownership path, and cert approach remain open.
2. **Bootstrap secret lifecycle** — how is `AGONARA_BOOTSTRAP_SECRET` generated,
   stored, and rotated on agonara-vps? Same secret per tier or distinct?
3. **Production public exposure** — prod is deployed internally on loopback and
   has a passed backup/restore drill, but no public hostname/TLS route yet.
   Decide the prod hostname, Caddy route, and whether prod exposure waits for CI
   release jobs or can be manually promoted.
4. **Nomos project + model specifics** — which Nomos project/base URL backs
   Agonara's evaluator, and which model? The dedicated-key requirement is settled
   by the CLAUDE.md "Nomos API Keys" rule; the project/model choice is not.
5. **Smoke scope** — beyond health + version + a real evaluation call, anything
   else the staging/prod smoke must assert (bootstrap status, admin UI)?
6. **Container registry image-tag invariant** — under build-on-VPS, confirm the
   `<version>`/`<git-sha>` tags are applied locally by the deploy script (vs the
   skill's registry-oriented wording).
