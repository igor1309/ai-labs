---
date: 2026-06-06
model: claude
description: "Implementation plan: register Agonara as a release unit and wire its staging/prod VPS deployment, CI deploy jobs, secrets, and (gated) real-LLM smoke."
---

# Agonara Deployment Wiring

## Goal

Stand up Agonara's per-unit tag-release deployment to agonara-vps — release-unit registration, staging/prod VPS scaffolding, CI deploy jobs, secrets, and the (gated) real-LLM smoke — implementing [ADR-017](../adr/adr-017-private-instance-deployment-operational-boundary.md) and consuming the [Operations Health Version](../specs/operations-health-version.md) and [Open-Answer Evaluator Real-Provider Runtime](../specs/open-answer-evaluator-real-provider-runtime.md) specs. This plan covers `deployment-handoff.md` §7 wiring plus the deploy-job dependencies on §6.

## Execution mode

```
Mode: human-review-gated
Human review between tasks: yes
Stop conditions: failed gates, unclear scope, missing credentials/tooling (VPS host/SSH/Nomos key), destructive operations (host provisioning, secret creation, first prod deploy), explicit user interruption
Push policy: push at closeout
```

Deployment wiring provisions real infrastructure and secrets and triggers irreversible release machinery, so each phase stops for human review. The executor MUST stop rather than guess when VPS host access, SSH keys, the dedicated Nomos project/key, or DNS/TLS ownership are missing.

## Execution lock

```
Worktree mode: none
Expected worktree: repository root (no separate worktree)
Expected branch: claude/agonara-deploy-wiring-* (a dedicated branch off trunk)
Preflight check: [x] done — user approved continuing in `/Users/igormalyarov/.codex/worktrees/a321/ai-labs` on `codex/agonara-adr018-runtime` after the declared lock failed.
```

## Scope guardrails

Out of scope for this plan (per ADR-017 and ADR-018 non-goals):

- application behavior changes beyond the already-delivered version surfacing and the gated real-provider runtime defined by its spec;
- choosing the container registry path (build-on-VPS is committed; registry is a future extension);
- prompt text, Nomos project/model selection, or model-routing;
- raw-artifact retention storage (raw artifacts remain non-persistent);
- bootstrap-secret generation/rotation procedure design (an open operational question — surface it, do not invent policy);
- the curator-suggestion real-provider migration;
- any change to another project's `*-core.yml` workflow.

## ADR traceability matrix

| ADR-017 invariant | Phase |
| --- | --- |
| Deploy as container on agonara-vps; no worktree-only/un-pinned prod build | Phase 2, Phase 3 |
| Staging and prod are separate containers — distinct names, loopback ports, named volumes | Phase 2 |
| Containers bind loopback; only the reverse proxy is network-exposed; each tier served over HTTPS | Phase 2 |
| Deploy builds on agonara-vps and tags image as both `<version>` and `<git-sha>` | Phase 2 |
| Prod deploy retains prior image and can roll back without rebuild | Phase 2 |
| Deploy gates promotion on a health check confirming the live version | Phase 3 (consumes Operations Health Version spec) |
| `AGONARA_BOOTSTRAP_SECRET` and provider creds are host-side runtime config, never in repo/image/logs/backups | Phase 2, Phase 3 |
| Prod `/data` backed up automatically ≥ daily, stored off-host | Phase 2 |
| Documented restore drill passes before prod is declared real; re-validated on backup change | Phase 2 |
| Backups exclude provider creds, session/CSRF material, raw evaluator artifacts (ADR-008/ADR-015) | Phase 2 |
| Release unit registered; canonical version in `agonara/package.json`; manifest in sync | Phase 1 |
| Real-LLM evaluation smoke routes through Nomos (ADR-018) | Phase 4 (gated) |

## Phase 1 — Register Agonara as a release unit

- **Objective**: Agonara is a declared Node + Docker release unit with a real initial version and an in-sync manifest.
- **Key work items**: add `"agonara"` to `paths` in `release-units.config.toml`; regenerate `release-units.toml` via `scripts/release/generate-manifest.js` (expect a new `agonara` entry, `metadata = package.json`, `docker = true`); set `agonara/package.json` version to the first real release (`0.1.0`), keeping `private: true`.
- **Dependencies**: none.
- **Risks**: manifest drift if regeneration is skipped (CI fails on drift); basename collision (mitigated — `agonara` is globally unique, no underscores); **premature release** — once the unit is registered and the version differs from the last `agonara_v*` tag, pushing an `agonara_v*` tag fires `release-unit.yml`. The version bump is committed here, but the tag MUST NOT be pushed until Phase 3's deploy jobs are merged (per the §9 runbook); otherwise a release fires with no deploy step. Registration and the version bump alone (no tag) do not trigger a deploy.
- **Validation**: `node scripts/release/generate-manifest.js` produces no further diff; manifest validation (`validate-manifest.js` / pre-commit hook) passes; root `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit` green; no `agonara_v*` tag is pushed in this phase.
- **Completion signal**: `agonara` appears in `release-units.toml` with `docker = true`, version `0.1.0`, manifest validation passes in CI, and no release has fired.

## Phase 2 — VPS-side scaffolding

- **Objective**: agonara-vps can build, run, health-gate, back up, and roll back staging and prod, modeled on `nomos/scripts/*`.
- **Key work items**: add `agonara/compose.staging.yml` and `agonara/compose.prod.yml` (or one parameterized compose) with distinct container names, distinct loopback ports, named volumes `agonara-staging-data` / `agonara-data`, `AGONARA_BOOTSTRAP_SECRET` and provider env from the environment, and the healthcheck retained; add `agonara/scripts/deploy-staging.sh`, `deploy-prod.sh`, `rollback-prod.sh` that build on host, tag the image `<version>` and `<git-sha>`, snapshot the prior prod image as `:rollback`, and health-gate on `/operations/health`; one-time host prep — Docker + compose, `/opt/agonara`, reverse proxy + TLS + domain, an automated ≥ daily off-host `/data` backup, and secure host-side `AGONARA_BOOTSTRAP_SECRET`.
- **Dependencies**: Phase 1; ADR-017; **human-provided** VPS host access, SSH key, DNS/TLS ownership, and backup storage location.
- **Risks**: loopback/proxy misconfiguration exposing a tier directly; image-tag invariant missed locally (no registry to enforce it); backup that silently includes secrets or omits restorable state; staging/prod sharing a volume by mistake.
- **Validation**: local Docker verification per ADR-017 and `deployment-handoff.md` §8 (the docker-verification list also given in `deployment-target.md`'s "Implementation handoff" section): `docker build`, container start, `/operations/health` incl. version, structured-log check, no worktree-only bind mounts; a manual restore drill from an off-host backup succeeds; staging and prod use distinct volumes and ports.
- **Completion signal**: a staging deploy script run on agonara-vps brings up the container, health returns `status: ok` with the expected version over HTTPS through the proxy, a backup artifact exists off-host, and a restore drill reproduces state.

## Phase 3 — CI deploy jobs in `release-unit.yml`

- **Objective**: a release tag drives `verify → core → deploy-agonara-staging → deploy-agonara-prod → github-release`, with version verification and failure handling.
- **Key work items**: add `deploy-agonara-staging` (needs `[core, verify]`, `if: basename == 'agonara'`) that `scp`s source to agonara-vps, runs `deploy-staging.sh`, verifies the live version via `/operations/health` (consumes the Operations Health Version spec), and runs the staging smoke (health + version + bootstrap + admin UI); add `deploy-agonara-prod` (needs `[deploy-agonara-staging, verify]`) running `deploy-prod.sh`, version verify, prod smoke, Telegram notify on success, rollback on `failure()`; wire both into the `github-release` `needs`/`if` guards and the `notify` job's `needs`/`job_results`; add repo secrets `AGONARA_VPS_HOST`, `AGONARA_VPS_USER`, `AGONARA_VPS_SSH_KEY`, `AGONARA_NOMOS_API_KEY`, and an evaluation smoke token.
- **Dependencies**: Phase 2; the secrets above provisioned by a human; `CI_BOT_TOKEN` / `CI_CHAT_ID` already exist.
- **Risks**: a deploy failure not blocking the GitHub release or not paging Telegram; version verify passing against a stale container; secrets exposed in logs.
- **Validation**: a staging-only dry run (reduced-scope tag path) shows `deploy-agonara-staging` green with a passing version assertion; a forced failure proves rollback and that `github-release` is blocked and Telegram fires.
- **Completion signal**: the release pipeline reaches `github-release` only after staging and prod deploys pass their version-verified smokes, and any deploy failure both blocks the release and notifies.

## Phase 4 — Real-LLM deploy smoke (gated)

- **Objective**: the staging/prod smoke exercises one real Nomos evaluation, in addition to health + version.
- **Key work items**: build the real provider runtime per the [Open-Answer Evaluator Real-Provider Runtime](../specs/open-answer-evaluator-real-provider-runtime.md) spec (Nomos adapter, LLM evaluator policy, single-flight authenticated trigger, composition-root env wiring); provision Agonara's **own** Nomos project + key as host-side runtime env (`AGONARA_NOMOS_BASE_URL`, `AGONARA_NOMOS_MODEL`, `AGONARA_NOMOS_API_KEY`); extend the staging/prod smoke to drive one authenticated evaluator tick and assert a validated evaluation without leaking credentials or raw artifacts.
- **Dependencies**: **gated by [ADR-018](../adr/adr-018-open-answer-evaluator-real-provider-runtime.md)** and the real-provider spec being implemented and merged; Agonara's dedicated Nomos project/key (repo "Nomos API Keys" rule).
- **Risks**: smoke flakiness from real model latency; credential or raw-transcript leakage in smoke logs; smoke authoring feedback through a non-operational path.
- **Validation**: full suite green including the real-provider spec's executable acceptance (with an injected `fetch` fake); a staging smoke drives one real evaluation through Nomos and asserts redaction; credentials/raw artifacts absent from logs and health.
- **Completion signal**: staging and prod smokes assert a validated real evaluation routed through Nomos, with no credential or raw-artifact leakage.

> If Phase 4 is deferred, a staging-only or health+version-only first release is the reduced-scope path; prod-with-real-LLM follows once ADR-018's spec is implemented.

## Phase 5 — Docs / governance closeout

- **Objective**: governance artifacts reflect the wiring.
- **Key work items**: confirm `deployment-target.md` is promoted (already done — it points to ADR-017); add `agonara/docs/log.md` entries (and repo `docs/log.md` if the release-unit/CI wiring is repo-wide); confirm the README Components table still represents agonara (no row change expected); surface the still-open operational questions (bootstrap-secret lifecycle, DNS/TLS ownership, backup cadence/storage specifics) where the owner tracks them.
- **Dependencies**: Phases 1–3 (and Phase 4 if included).
- **Risks**: log omission before push; stale README status.
- **Validation**: logs updated; README accurate; no manifest/CI drift.
- **Completion signal**: logs and README reflect the wiring and the first release is reproducible from the runbook.

## Done criteria

- `agonara` is a registered Node + Docker release unit with version `0.1.0` and an in-sync manifest enforced in CI.
- agonara-vps can deploy, health-gate (incl. version), back up off-host, and roll back staging and prod, each served over HTTPS via the reverse proxy with isolated volumes and ports.
- `release-unit.yml` runs version-verified staging and prod deploys whose failure blocks the GitHub release and pages Telegram.
- A restore drill from an off-host backup has passed before prod is declared real.
- Required repo secrets exist and never appear in logs.
- The §9 first-release runbook is executable end-to-end (health + version smoke at minimum); the real-LLM smoke is in place when Phase 4 is included.
- Full suite green (`./scripts/run_silent.sh "tests" npm test`) and build green (`./scripts/run_silent.sh "build" npx tsc --noEmit`).

## Final closeout

```
Final gates: ./scripts/run_silent.sh "tests" npm test; ./scripts/run_silent.sh "build" npx tsc --noEmit; local Docker verification; manifest validation
Archive plan: move to agonara/docs/plans/implemented/
Commit archive move: yes
Push/PR: follow push policy (push at closeout)
```
