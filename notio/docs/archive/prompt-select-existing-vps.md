---
title: Prompt — Select Existing VPS for Telegram Ingress Service
date: 2026-04-18
version: 0.0.1
author: OpenAI GPT-5.4 Thinking
status: draft
type: prompt
---

# Prompt

Review the existing VPS options and recommend the best one to host this service.

Context:
- one VPS is needed
- service is a small Swift/Hummingbird app
- ingress path: Telegram webhook -> Cloudflare -> Tunnel -> VPS -> service
- deployment: tag-driven CI/CD, Docker image, health/version verification
- priority: simplest reliable fit, not theoretical maximum capacity

Evaluate each available VPS against:
- public reachability suitability for Cloudflare Tunnel setup
- operational simplicity
- current workload / contention risk
- available resources
- reliability
- maintainability

Return:
1. recommended VPS
2. brief justification
3. risks / tradeoffs
4. anything that must be checked before using it
