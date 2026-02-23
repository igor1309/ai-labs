---
date: 2026-02-23
model: gpt-5.2
description: "Phase 5: publish Grafana only through Cloudflare Tunnel + Access while keeping origin private."
---

# Phase 5: Secure access via Cloudflare Tunnel + Access

## Goal
Expose Grafana only behind Cloudflare Access using `cloudflared` on the host:
- no inbound public Grafana port
- Cloudflare Access challenge for unauthenticated users
- tunnel process auto-recovers after reboot

## Install cloudflared
On the VPS (as root):

1. Add Cloudflare apt key and source:
   - `mkdir -p /usr/share/keyrings`
   - `curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg`
   - `echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list`
2. Install package:
   - `apt-get update`
   - `apt-get install -y cloudflared`

## Configure tunnel and origin route
1. Create tunnel in Cloudflare Zero Trust and download tunnel credentials JSON.
2. Copy credentials to host:
   - `install -d -m 700 -o root -g root /etc/cloudflared`
   - `install -m 600 -o root -g root <tunnel-id>.json /etc/cloudflared/loki-grafana.json`
3. Copy repo config template and set real hostname:
   - `install -m 600 -o root -g root loki/host/cloudflared/config.yml /etc/cloudflared/config.yml`
   - update:
     - `tunnel` with tunnel name or UUID
     - `credentials-file` path
     - `ingress[0].hostname` with real Grafana hostname
4. Ensure Grafana origin stays private:
   - in compose, keep `127.0.0.1:3000:3000`
   - do not expose `3000` on `0.0.0.0`
5. Enable service:
   - `systemctl enable --now cloudflared`
   - `systemctl show cloudflared -p Restart --value` should be `always`

## Configure Cloudflare Access policy
In Cloudflare Zero Trust:
1. Create an Access application for the Grafana hostname.
2. Add allow policy for approved identities/groups only.
3. Keep default deny for everyone else.

## Verify Phase 5 on the VPS
Copy and run verifier:

1. Copy:
   - `scp loki/scripts/phase5/verify-host.sh root@<host>:/root/verify-loki-phase5.sh`
2. Run:
   - `PHASE5_GRAFANA_HOSTNAME=<grafana-hostname> bash /root/verify-loki-phase5.sh`

### Manual checks
1. Unauthenticated browser request to `https://<grafana-hostname>/login` is redirected/challenged by Cloudflare Access.
2. `ss -ltn sport = :3000` shows Grafana bound only to `127.0.0.1:3000`.
3. Reboot host and verify:
   - `systemctl is-active cloudflared` returns `active`
   - Grafana is still reachable through Access-protected hostname.

