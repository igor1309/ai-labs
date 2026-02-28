# Log

## 2026-02-23
- Put Loki rollout on hold for Oracle app observability while Oracle remains on Workers-native logging; resume Loki phases when unified non-Worker ingestion is required.
- Blocked dedicated-volume cutover for Phase 1 on VPS `<VPS_IP>`: provider expanded the primary disk instead of attaching a separate raw/unformatted `20G` volume; awaiting corrected provider action and device confirmation to complete `/var/lib/loki` migration from loopback.
- Execute Phase 1 provisioning on VPS `<VPS_IP>`: create non-root admin `loki`, enforce SSH key-only access (`PermitRootLogin no`, `PasswordAuthentication no`), set `DEPLOY_ENV=prod`, enable UFW with OpenSSH-only inbound, and mount temporary loopback Loki data storage at `/var/lib/loki`; mark Phase 1 as provisionally passed pending dedicated-volume cutover.
- Add Phase 7 artifacts: operations runbook, backup/restore scripts, and a host verifier with fixtures-backed tests for backup readiness, capacity checks, and Telegram alerting presence.
- Add Phase 6 artifacts: Compose label compliance checker with allowlist enforcement, onboarding checklist + allowlist source-of-truth docs, Compose service labels, and CI trigger coverage for `loki/**` changes.
- Add Phase 5 artifacts: cloudflared tunnel config template, Phase 5 host verifier script with fixtures-backed tests, and Cloudflare Tunnel + Access provisioning docs.
- Add Phase 4 artifacts: Alloy journald pipelines with central core-label injection, Docker metadata enrichment via `CONTAINER_ID_FULL` join, a Phase 4 host verifier script with fixtures-backed tests, and Phase 4 provisioning docs.
- Add Phase 3 artifacts: Loki+Grafana Docker Compose stack, Loki retention config (14 days), Grafana datasource provisioning, and Phase 3 deploy docs.
- Add Phase 2 artifacts: host runtime config templates (journald + Docker), a Phase 2 host verifier script with tests, and Phase 2 provisioning docs.
- Add Phase 1 tooling: cloud-init generator (library + CLI) and a host verifier script with fixtures-backed tests.
- Document Phase 1 VPS provisioning and hardening checklist.
- Add implementation plan `0001` with phased delivery, verification gates, label derivation/allowlisting rules, and CI label compliance checks.
- Add decision `0001` for Loki logging stack: single-host Loki+Grafana in Docker with host Alloy journald-first ingestion, bounded label schema, 14-day retention, and Cloudflare Tunnel + Access for Grafana.
