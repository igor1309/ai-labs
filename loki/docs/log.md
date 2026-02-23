# Log

## 2026-02-23
- Add Phase 4 artifacts: Alloy journald pipelines with central core-label injection, Docker metadata enrichment via `CONTAINER_ID_FULL` join, a Phase 4 host verifier script with fixtures-backed tests, and Phase 4 provisioning docs.
- Add Phase 3 artifacts: Loki+Grafana Docker Compose stack, Loki retention config (14 days), Grafana datasource provisioning, and Phase 3 deploy docs.
- Add Phase 2 artifacts: host runtime config templates (journald + Docker), a Phase 2 host verifier script with tests, and Phase 2 provisioning docs.
- Add Phase 1 tooling: cloud-init generator (library + CLI) and a host verifier script with fixtures-backed tests.
- Document Phase 1 VPS provisioning and hardening checklist.
- Add implementation plan `0001` with phased delivery, verification gates, label derivation/allowlisting rules, and CI label compliance checks.
- Add decision `0001` for Loki logging stack: single-host Loki+Grafana in Docker with host Alloy journald-first ingestion, bounded label schema, 14-day retention, and Cloudflare Tunnel + Access for Grafana.
