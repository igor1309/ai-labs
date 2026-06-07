---
date: 2026-06-07
model: gpt-5
title: agonara-deployment-handoff
description: "Handoff for deploying Agonara to agonara-vps via the repo's per-unit tag-release approach."
version: 0.3.0
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
  `https://staging.agonara.enoa.ai`; production is live at
  `https://agonara.enoa.ai` through Cloudflare DNS-only A records and Caddy
  auto-TLS on agonara-vps.
- **Admin exposure:** public `/admin` is operator-gated at Caddy with a `403`.
  Operators use the private loopback/SSH path for Admin access until a broader
  outer access layer is chosen.
- **LLM provider:** wire a real provider for staging/prod by pointing Agonara's
  open-answer evaluator provider adapter (ADR-015) at the repo's **Nomos** gateway,
  with Agonara's **own Nomos project + API key** (per the CLAUDE.md "Nomos API
  Keys" rule), and a real-LLM deploy smoke following the nomos pattern. The
  open-answer evaluator adapter exists and is deployed for both tiers; curator
  suggestions remain out of scope.
- **Note location:** here, under `agonara/docs/`.

> **This handoff is not "ops only."** The application code gates in
> [§6](#6-application-development-required-pre-deploy) are closed, the VPS-side
> staging/prod scaffolding is live, the release-unit/CI deployment machinery is
> wired, the first `agonara_v0.1.0` release has deployed staging and production,
> and public production routing is live.
>
> Remaining operational maintenance is listed in
> [§10 Remaining questions](#10-remaining-questions).

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
- **§7** deployment work is closed by the archived
  [Agonara Deployment Wiring](plans/implemented/agonara-deployment-wiring.md)
  implementation plan and the
  [deployment wiring closeout](reviews/agonara-deployment-wiring-closeout.md).

The release-unit and CI deploy wiring now exists, the first explicit release tag
has completed, and public production is reachable at `https://agonara.enoa.ai`.
The remaining work is bootstrap-secret lifecycle documentation and ongoing
release-smoke maintenance.

## 1. Current state

| Aspect | Status |
| --- | --- |
| Code | `agonara/` Node workspace, `type: module`, `engines.node >= 22`, dep `better-sqlite3` |
| Version | `agonara/package.json` → `0.1.0`; live staging/prod containers report `0.1.0` |
| Release unit | Registered in `release-units.config.toml` / `release-units.toml` as Node metadata + Docker-producing unit |
| CI (core) | `.github/workflows/agonara-core.yml` exists — tests + `docker build` + container smoke (`/operations/health`, bootstrap, admin UI) |
| Container | `agonara/Dockerfile` (node:22-slim, non-root, `/data` sqlite volume, `HEALTHCHECK` on `/operations/health`, `EXPOSE 8080`) |
| Compose | `agonara/compose.yaml` for local/dev plus `compose.staging.yml` / `compose.prod.yml` for VPS staging/prod; staging binds `127.0.0.1:18081:8080`, prod binds `127.0.0.1:18080:8080`, each with distinct named volumes and host-side env files |
| Deploy job | `release-unit.yml` has `deploy-agonara-staging` and `deploy-agonara-prod`; `github-release` requires both to succeed for `agonara` tags, Agonara deploy secrets fail fast before source upload, deploy failures fan into the shared Telegram failure workflow, and production release smoke now verifies public `GET /learn`, public `/admin` gate behavior, and public health/version after the internal evaluator smoke |
| Deploy scripts | `agonara/scripts/deploy-staging.sh`, `deploy-prod.sh`, `rollback-prod.sh`, `backup-staging.sh`, `restore-staging.sh`, `backup-prod.sh`, `restore-prod.sh` exist and are wired for CI source upload |
| Staging/prod compose | Present. Staging is live on `root@172.245.246.108`: `agonara-staging` healthy on loopback `127.0.0.1:18081`, health returns version `0.1.0`, Caddy serves `https://staging.agonara.enoa.ai/operations/health`, a real open-answer evaluator smoke passed through the operations trigger and dedicated Nomos staging project, and staging `/data` backup/restore has been rehearsed from off-host storage. Prod is live as `agonara`, loopback-bound on `127.0.0.1:18080`, with health returning version `0.1.0`, distinct prod env secrets, a dedicated Nomos prod project/key, real evaluator smoke, daily off-host backup cron, and a restore drill from the downloaded off-host artifact. Caddy serves `https://agonara.enoa.ai`: public `GET /learn` returns the Learn UI, public `GET /admin` returns the Caddy operator gate `403`, and public `/operations/health` returns `status: ok` with version `0.1.0` |
| Health/version | `/operations/health` returns `{status, version, checkedAt, requestId}` — version sourced from `package.json` (§6a, implemented) |
| LLM evaluation (runtime) | Open-answer evaluator real-provider runtime exists (§6b implemented). Staging has `AGONARA_NOMOS_BASE_URL=https://staging.nomos.enoa.ai`, model `openai/gpt-5-nano`, and a dedicated Nomos staging project/key. Prod has `AGONARA_NOMOS_BASE_URL=https://nomos.enoa.ai`, model `openai/gpt-5-nano`, and a dedicated Nomos prod project/key. The smoke script `scripts/smoke-open-answer-evaluator.mjs` schedules one exact evaluator job, triggers `/operations/open-answer-evaluator/tick`, and verifies the attempt detail contains an evaluation. Curator-suggestion real-provider migration remains out of scope. |
| VPS secrets | Staging and prod bootstrap, operations trigger, Nomos base URL/model/key, smoke-admin credentials, and backup SSH keys are provisioned host-side with restrictive file modes; Agonara-specific GitHub deploy SSH secrets are provisioned and were verified by the first-release workflow |

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

The deployment-wiring work in this handoff was steps 1–3 (register + version)
plus the Agonara deploy jobs, GitHub deploy SSH secrets, and VPS-side
scaffolding. The first explicit tag, `agonara_v0.1.0`, completed on 2026-06-06.
Future releases use the same per-unit tag flow.

## 3. Target topology — agonara-vps

- **One dedicated VPS: agonara-vps.** Owner chose **staging + prod**, so both
  tiers run on agonara-vps as separate containers on distinct loopback ports —
  `agonara-staging` on `127.0.0.1:18081` and `agonara` on
  `127.0.0.1:18080`.
- Agonara binds **loopback only**; external web/API access needs a reverse proxy
  (Caddy/nginx) terminating TLS in front of each container. **HTTPS + domain are
  in scope for v1**, so the reverse proxy + TLS + DNS are part of the first
  deployment, not a later add-on. Current hostnames are
  `staging.agonara.enoa.ai` and `agonara.enoa.ai`.
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

## 5. Closed prerequisite decisions

The ADR/spec gates that originally blocked deployment are closed.

- **G1 Deployment ADR and G3 backup/restore minimums.**
  [ADR-017](adr/adr-017-private-instance-deployment-operational-boundary.md)
  accepts the private-instance deployment boundary, admin operational
  responsibility, HTTPS/reverse-proxy requirement, and backup/restore minimums.
  `deployment-target.md` now points to ADR-017.
- **G2 evaluator worker execution and real-provider runtime.**
  [ADR-018](adr/adr-018-open-answer-evaluator-real-provider-runtime.md) amends
  ADR-015, and
  [Open-Answer Evaluator Real-Provider Runtime](specs/open-answer-evaluator-real-provider-runtime.md)
  defines the implemented provider, policy, worker trigger, validation, and
  env-only credential wiring.

The first production release ran with health/version, backup/restore, and
real-Nomos evaluator smoke gates closed.

## 6. Application gates closed

The deploy verify/smoke path depends on two application behaviors, both now
implemented in `src/` and covered by tests.

### 6a. Deployed version

`/operations/health` returns `{status, version, checkedAt, requestId}` with
`version` sourced from `package.json` at runtime through the composition root
(`startServer` → `createServer`). The behavior is specified in
[Operations Health Version](specs/operations-health-version.md) and covered by
unit tests plus the container smoke.

### 6b. Real LLM evaluator provider

[ADR-018](adr/adr-018-open-answer-evaluator-real-provider-runtime.md) and the
[real-provider runtime spec](specs/open-answer-evaluator-real-provider-runtime.md)
define the contract implemented in `src/open-answer-evaluator-runtime.js`,
`src/student-workspace.js`, and `src/server.js`: a Nomos HTTP provider adapter,
an LLM evaluator policy, output validation, async-compatible worker execution,
a single-flight operational trigger, and composition-root wiring from runtime
environment only.

Curator-suggestion real-provider migration remains out of scope. That path uses
deterministic provider fakes per
`docs/specs/llm-assisted-curation-suggestions.md`.

## 7. Deployment wiring closeout

Deployment wiring is closed. The archived
[Agonara Deployment Wiring](plans/implemented/agonara-deployment-wiring.md)
plan and
[Agonara Deployment Wiring Closeout](reviews/agonara-deployment-wiring-closeout.md)
record the release-unit registration, VPS scaffolding, CI deploy jobs, host-side
runtime secrets, backup/restore mechanics, and real-LLM deploy smoke.

Static artifacts now present:

- `release-units.config.toml` discovers `agonara`, and `release-units.toml`
  contains the Docker-producing `agonara` release unit.
- `agonara/package.json` carries the canonical `0.1.0` version.
- `agonara/compose.staging.yml` and `agonara/compose.prod.yml` define isolated
  tier containers, loopback ports, and data volumes.
- `agonara/scripts/deploy-staging.sh`, `deploy-prod.sh`, `rollback-prod.sh`,
  `backup-staging.sh`, `restore-staging.sh`, `backup-prod.sh`, and
  `restore-prod.sh` are wired for CI source upload and host-side execution.
- `.github/workflows/release-unit.yml` includes `deploy-agonara-staging`,
  `deploy-agonara-prod`, release gating, deploy failure fan-in, and the Agonara
  public-route release smoke.

The GitHub deploy SSH secrets (`AGONARA_VPS_HOST`, `AGONARA_VPS_USER`,
`AGONARA_VPS_SSH_KEY`) were provisioned and verified before the first release.
Provider, smoke, bootstrap, and backup secrets remain host-side in tier env
files.

## 8. Release verification record

The first release gates ran from trunk before `agonara_v0.1.0` was pushed. The
release-readiness script now correctly rejects reuse of that completed tag, and
the closeout record links the successful Actions run and GitHub Release.

## 9. First-release record

Status: completed on 2026-06-06 by tag `agonara_v0.1.0`. The release workflow
passed `verify`, `core`, `deploy-agonara-staging`, `deploy-agonara-prod`, and
`github-release`. Staging and production both passed health/version verification
and a real open-answer evaluator smoke.

Current release smoke includes staging/prod health/version checks, staging/prod
real open-answer evaluator smokes, and production public route smoke for
`GET /learn`, `/admin` operator-gate behavior, and `/operations/health`.

## 10. Remaining questions

Decided by the owner (recorded in the intro): topology (staging + prod on
agonara-vps), image delivery (build-on-VPS), HTTPS + domain in scope for v1, a
real LLM provider via the Nomos gateway (Agonara's own Nomos project + key), prod
hostname `agonara.enoa.ai`, Caddy TLS ownership, and `/admin` operator-gating at
Caddy.

Still open:

1. **Bootstrap secret lifecycle** — how is `AGONARA_BOOTSTRAP_SECRET` generated,
   stored, and rotated on agonara-vps? Same secret per tier or distinct?
2. **Future Admin access layer** — public `/admin` is blocked at Caddy for now.
   Decide later whether to replace the hard gate with Cloudflare Access, VPN,
   allowlisted operator IPs, or another explicit access layer.
