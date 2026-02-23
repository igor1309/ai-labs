---
date: 2026-02-23
model: gpt-5.2
description: "Phase 4: install Alloy as host systemd collector, derive core labels centrally, and enrich Docker journald logs via container-id join."
---

# Phase 4: Install and configure Alloy (host systemd)

## Goal
Install Alloy on the host and enforce the label policy from decision `0001`:
- ingest journald as the single source
- inject core labels centrally (`project`, `service`, `env`)
- derive `env` only from host `DEPLOY_ENV`
- enrich Docker journald streams via container-id join
- keep forbidden labels in log body

## Install Alloy
On the VPS (as root), install Alloy from Grafana's apt repo:

1. Install dependencies:
   - `apt-get update`
   - `apt-get install -y gpg wget`
2. Add Grafana apt source:
   - `wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | tee /usr/share/keyrings/grafana.gpg >/dev/null`
   - `echo "deb [signed-by=/usr/share/keyrings/grafana.gpg] https://apt.grafana.com stable main" | tee /etc/apt/sources.list.d/grafana.list >/dev/null`
3. Install Alloy:
   - `apt-get update`
   - `apt-get install -y alloy`

## Configure Alloy
1. Copy repo config:
   - `install -d -m 755 -o root -g root /etc/alloy`
   - `install -m 640 -o root -g root loki/host/alloy/config.alloy /etc/alloy/config.alloy`
2. Enable experimental stability for `loki.enrich`:
   - `install -d -m 755 -o root -g root /etc/systemd/system/alloy.service.d`
   - `cat >/etc/systemd/system/alloy.service.d/loki-stack.conf <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/alloy run --storage.path=/var/lib/alloy/data --stability.level=experimental /etc/alloy/config.alloy
EOF`
3. Reload and start:
   - `systemctl daemon-reload`
   - `systemctl enable --now alloy`

## Label derivation implemented by `config.alloy`
1. Systemd services:
   - source label: `__journal__systemd_unit`
   - required pattern: `<project>__<service>@<instance>.service`
   - mapping:
     - `project <- <project>`
     - `service <- <service>`
     - `env <- DEPLOY_ENV`
2. Docker containers:
   - journald identity field used for join: `CONTAINER_ID_FULL` (`__journal_container_id_full` in Alloy relabel rules)
   - metadata source: Docker discovery labels `com.logging.project` and `com.logging.service`
   - join mechanism: `loki.enrich` with `target_match_label=container_id` and `logs_match_label=container_id`
3. Anti-override:
   - `project`, `service`, `env` are dropped then re-derived centrally, so payload-provided values do not override.

## Verify Phase 4 on the VPS
Copy and run the verifier script:

1. Copy:
   - `scp loki/scripts/phase4/verify-host.sh root@<host>:/root/verify-loki-phase4.sh`
2. Run:
   - `bash /root/verify-loki-phase4.sh`

### Manual smoke flow (systemd + Docker + override)
1. Systemd smoke unit:
   - `systemd-run --unit trend-scout__api@1.service /usr/bin/bash -lc 'logger -t phase4-systemd "{\"message\":\"phase4-systemd\"}"'`
2. Docker smoke container:
   - `docker run --rm --label com.logging.project=trend-scout --label com.logging.service=worker --name loki-phase4-smoke alpine sh -c 'echo phase4-docker'`
3. Override attempt (must not win):
   - `systemd-run --unit trend-scout__api@1.service /usr/bin/bash -lc 'logger -t phase4-override "{\"message\":\"phase4-override-attempt\",\"project\":\"evil-project\",\"service\":\"evil-service\",\"env\":\"dev\"}"'`
4. Confirm Docker identity field:
   - `journalctl -n 50 CONTAINER_NAME=loki-phase4-smoke -o json | grep CONTAINER_ID_FULL`
5. Confirm Loki labels in Grafana Explore:
   - `project=trend-scout, service=api`
   - `project=trend-scout, service=worker`
   - override record still indexed as `project=trend-scout, service=api, env=<DEPLOY_ENV>`

