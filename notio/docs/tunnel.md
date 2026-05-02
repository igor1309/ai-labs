VPS 107.172.143.196

502 — tunnel is working correctly. Cloudflare reaches the VPS, cloudflared forwards to localhost:8080, and gets connection refused (no service yet). Once the Hummingbird app listens on 8080, it'll get 200s.

Summary

┌─────────────────┬────────────────────────────────────────┐
│      Item       │                 Value                  │
├─────────────────┼────────────────────────────────────────┤
│ Tunnel name     │ inbox                                  │
├─────────────────┼────────────────────────────────────────┤
│ Tunnel ID       │ 688cca4f-c4d4-4a43-8579-2001d5defe33   │
├─────────────────┼────────────────────────────────────────┤
│ Hostname        │ inbox.enoa.ai                          │
├─────────────────┼────────────────────────────────────────┤
│ Backend         │ http://localhost:8080                  │
├─────────────────┼────────────────────────────────────────┤
│ systemd service │ cloudflared.service (enabled, running) │
├─────────────────┼────────────────────────────────────────┤
│ Config          │ /etc/cloudflared/config.yml            │
└─────────────────┴────────────────────────────────────────┘