---
date: 2026-06-07
model: claude-opus-4-8
description: "Forward tasks for making an Agonara instance reachable by the agents people actually use (Telegram bots, Claude Code on web/app, other MCP or HTTP agents)."
---

# Backlog — Agent Connectivity

Forward tasks only. These cover the second half of the BYOA claim: once an
operator *has* an instance (see
[`plans/byoa-self-host-paved-path.md`](plans/byoa-self-host-paved-path.md)), how
do the agents people actually use reach it over the network?

Today the reverse proxy exposes the API and `/learn` over public HTTPS, and an
agent authenticates with password login → `agonara_session` cookie → CSRF (see
the `agonara-api-access` skill). That works for a coding agent that can manage a
session; it is awkward for other runtimes. The items below close that gap.

## Token (bearer) authentication for agents

Add an API-token / personal-access-token scheme so an agent can authenticate by
presenting a bearer credential on each request, instead of driving the
browser-style password + session-cookie + CSRF flow.

- This is the biggest single enabler for "any agent, anywhere."
- It touches the authentication/credential boundary (ADR-008), so it needs its
  own spec and ADR decision before implementation — not a drive-by change.
- Must keep the existing session/CSRF path intact for the browser UIs.

## MCP connector for the Agonara API

Provide an MCP server that wraps the published API contract, so any MCP-capable
agent (and many chat-hosted agents) can mount Agonara in one step rather than
hand-rolling HTTP calls.

- Agonara currently ships operator *skills*, not an MCP server; this is a
  deliberate added surface, not a default — weigh it against the skills approach
  before committing.
- Should consume the OpenAPI contract as source of truth, not duplicate route
  knowledge.

## Remote admin access decision

The admin role cannot be driven by a remote agent today: public `/admin` is
blocked at the reverse proxy (loopback/SSH only). Decide and document the outer
access layer before any remote admin-agent workflow is promised.

- This is already tracked as a standing follow-up in
  [`deployment-handoff.md`](deployment-handoff.md) (Active Follow-Up — Future
  Admin access layer); this item is the agent-connectivity view of it.
- Candidate shapes named there: Cloudflare Access, VPN, or a narrow allowlist.
  Agonara's own admin session and CSRF controls must remain behind any outer
  gate.

## Sandbox egress allowlist guidance

Document that agents running in network-restricted sandboxes (e.g. Claude Code
on the web / mobile app) can only reach hosts on their environment's egress
allowlist, so the operator must add their instance domain to that allowlist.

- This is operator-facing guidance, not a code change; fold it into the
  self-host runbook (paved-path plan, Phase 2).
- Telegram-style bots whose backend runs on an operator-controlled host are not
  affected — their backend can call any public URL directly.
