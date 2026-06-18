---
date: 2026-06-15
model: claude
description: "Future-thinking design notes: which AgenticOps platform ideas are worth adopting for Agonara's BYOA model. Two net-new affordances — a self-describing API (runtime discovery + follow-up hints) and an agent-facing diagnose — sharpened by the part №4 role/scenario material, plus what Agonara deliberately does not adopt."
---

# AgenticOps affordances — future thinking

> Status: exploratory design notes, not an accepted direction. Captures the
> net-new ideas drawn from the AgenticOps homelab platform series
> ([`../research/agenticops.md`](../research/agenticops.md)) and where they could land
> in Agonara. The concrete forward tasks live in
> [`skills.md`](skills.md); this doc is the reasoning
> behind them.

## Starting point: Agonara already is an AgenticOps-shaped platform

AgenticOps part №3 describes a platform that agents drive through **CLI +
SKILL.md**, over **adapters** that hide raw component calls, with a **stable
contract**, explicit **statuses**, prescribed **retry/stop trajectories**, and
**per-agent tool scoping**. Agonara already implements that pattern, with one
substitution: the **OpenAPI contract is the flat command surface** instead of a
CLI.

| AgenticOps idea | Agonara equivalent (already built) |
|---|---|
| Agents operate via `CLI + SKILL.md`, flat commands | BYOA: per-role `SKILL.md` over the OpenAPI contract (the skill is the operating surface, the contract is the substrate) |
| Adapters wrap components; only they make raw calls; handle errors/secrets | `agonara-api-access`: the single foundation defining session/CSRF/idempotency and the `accepted`/`rejected`/`fault` envelope |
| Stable statuses + prescribed retry/stop trajectories | The envelope + `ApiRejectionReason` enum + the explicit "retry vs. stop, branch on `reason`" table |
| Topology encapsulated; avoid leaky abstractions | "Stay inside what the API tells you" — the instance enforces authority/visibility; the agent never infers topology |
| Per-agent tool scoping for security | Per-role skills (curator bucket / student / admin), enforced server-side by role |
| Typed, compiled, tested → determinism | OpenAPI generated from route declarations as the source of truth, with contract tests |
| Orchestration scenarios: deploy/verify/diagnose | `scripts/deploy-*`, `backup`/`restore`/`rollback`, `smoke-*`; `docs/deployment-discipline.md` |
| Stable external API as the front door | Bearer-token auth + the gated MCP connector, already in [`agent-connectivity.md`](agent-connectivity.md) |

So most of the post is **validation** of choices Agonara already made, and its
specific front-door proposals (bearer token, MCP wrapper, two auth adapters) are
already captured with sharper reasoning in the agent-connectivity backlog. Two
ideas are genuinely net-new and worth exploring.

### Second corroboration: the Twenty CRM "CLI + thin SKILL.md" post

A separate, unrelated write-up
([`../research/cli/twenty-crm-cli-skill.md`](../research/cli/twenty-crm-cli-skill.md))
reaches the same pattern from the consumer side: *given a REST API with an
OpenAPI/Swagger spec, generate a thin CLI wrapper and put a thin `SKILL.md` over
it* — explicitly rejecting both a hand-coded wrapper and the
"have the agent write its own CLI" approach (hardcoded, needs a rebuild when the
schema shifts). Its two load-bearing claims — *nothing to support* and *the skill
auto-adapts to custom fields/collections because the schema lives server-side* —
are exactly the properties Agonara gets from skill-over-contract, with the
contract (not a generated CLI) as the command surface. Agonara already avoided
the anti-pattern the post warns against when it removed the developer-facing
`agonara-api` skill as built for the wrong consumer.

It does **not** move Agonara toward a CLI, but it sharpens the existing
CLI-vs-contract tradeoff two ways:

- **The CLI argument is stronger here than in the post's own case, yet still
  loses.** The post's auth is a single bearer token from a profile; Agonara's is
  cookie + CSRF (`X-Agonara-CSRF` from `GET /identity/session`) + idempotency
  keys + envelope branching, all carried as *prose* the agent must execute
  correctly each time (`agonara-api-access`). A generated CLI would bake that
  fiddly handshake into a tool. The reason to still decline a *mandatory* CLI is
  the BYOA premise the api-access skill states as an assumption — "no repository,
  no build or test tooling, no particular agent runtime" — which a required CLI
  binary reintroduces. The auto-adapt benefit the post credits to the CLI,
  Agonara already gets from the contract.
- **It reinforces two existing items rather than a new one.** Bearer-token auth
  (`agent-connectivity.md`) removes the part of the handshake that makes raw HTTP
  error-prone, independent of any CLI; and runtime command **discovery** (Idea 1)
  is the half a Swagger-derived CLI gives for free that Agonara's static skills
  do not. The post is one more data point that the discovery affordance — not a
  CLI — is the thing worth adopting.

## Idea 1 — A self-describing API: runtime discovery + follow-up hints

**The AgenticOps move.** The platform's CLI does *discovery* of which commands
an agent may use at startup, can enable/disable commands per agent, exposes
per-command help, and "some commands return follow-up commands — hints for what
else to try."

**The gap in Agonara.** The per-role skills are static Markdown. The instance
never tells an agent, at runtime, *given your role and current state*, what it
can do next. The agent re-derives the next step from the skill text every time.
This overlaps the open "Skill discovery, publishing, and packaging" item in
[`skills.md`](skills.md), but pushes further: the affordance
can live **in the envelope itself**, not only in packaging.

**Shape worth exploring.** An optional, additive field on `accepted` responses —
e.g. `next` / `links` — listing the operations that are *available and
meaningful from here* for this caller's role and state (HATEOAS-flavoured, but
role- and state-scoped, not a blanket route dump). The instance already knows
authority and visibility; surfacing the affordance is cheaper and less
drift-prone than the agent inferring it from prose.

**Why this is separable from CLI-vs-HTTP.** Agonara deliberately chose
skill-over-HTTP rather than a CLI (see the MCP-connector reasoning in
`agent-connectivity.md`): for a coding agent that can execute HTTP, the skill
*is* the one-step mount. The valuable part of the AgenticOps idea — discovery +
follow-up hints — is **independent** of that packaging choice and can be adopted
without reversing it.

**Part №4 sharpens this into a two-layer rule.** In AgenticOps the agent's
**role arrives as an external parameter** (config/env), and that role does two
things: it *filters which commands the agent sees at discovery time*, **and** the
platform *re-validates the access on every call*. Agonara already does the second
layer (role enforced server-side per operation); the first layer — the agent only
ever discovers the operations its role can meaningfully call — is the missing
half, and it is the **same filter** as Idea 1's `next`/`links`. The unification
worth adopting: one role/state filter, two consumers — it both *generates the
discovery surface* and *gates execution*, from a single source of truth, so the
two can never drift.

**Open questions.**

- Does the affordance belong on the envelope (`next`/`links`), in the OpenAPI
  contract (typed link relations), or in a discovery endpoint the skill calls
  once? The first keeps it state-aware; the last keeps response bodies lean.
- How does it stay generated from the route declarations (source of truth), not
  hand-maintained, so it cannot drift from the contract the way the untyped
  request bodies already can?
- Does exposing "what's available next" leak anything about state the caller
  should not see? It must respect the same role/visibility boundary the rest of
  the API enforces.

## Idea 2 — An agent-facing `diagnose`

**The AgenticOps move.** Observability exists "for debugging by agents": an agent
asks the platform for logs/traces with filters, the platform knows where the
logs live, collects and cleans them across sources, and returns them paged with
source attribution and the correlated chain of events. Part №4 names the
agent-developer's entry point for this concretely: *"a quick health slice of the
whole system via a **diagnostic-bundle** request."*

**The gap in Agonara.** There are deploy and `smoke-*` scripts but no
agent-facing **diagnose** capability. Agonara already threads a `requestId`
through both the envelope and the `/operations/health` document — the seam for a
"given a `requestId`, return the correlated logs/trace" affordance is already
there. This connects to the on-hold `loki` logging stack (root repo) as the
eventual sink.

**Shape worth exploring — lead with the bundle.** The cheapest valuable v1 is the
Part №4 framing, not the per-`requestId` slice: a **diagnostic bundle** that
composes the existing `/operations/health` document with the recent correlated
faults (the `requestId`s an agent already holds), redacted (no secret values, per
`deployment-discipline.md`), paged, with source attribution. This needs no
Loki/Tempo stack — it reuses what Agonara already exposes. The per-`requestId`
log/trace slice is the natural *next* layer once structured `requestId`-keyed
logging and a read path exist; the full trace correlation is later still.

**Open questions.**

- Who is allowed to diagnose — admin only, or the owner of the originating
  request? The redaction and visibility rules differ sharply.
- Is this an API operation (fits the BYOA substrate) or an ops-side capability
  behind the loopback-only admin boundary (`agent-connectivity.md`, remote-admin
  decision)? The answer depends on who the consumer is.
- What is the minimum first step that delivers value without the full
  Loki/Tempo stack — almost certainly structured `requestId`-keyed logs plus a
  read path, deferring trace correlation.

## What Agonara deliberately does **not** adopt

- **A CLI as the operating surface.** A considered tradeoff, not a gap — for
  agents that can execute HTTP, the skill is the one-step mount and a CLI/MCP
  wrapper is duplicated surface until a constrained (no-HTTP) runtime needs it
  (`agent-connectivity.md`). The Twenty CRM post
  ([`../research/cli/twenty-crm-cli-skill.md`](../research/cli/twenty-crm-cli-skill.md))
  is a worked example of the CLI variant; the corroboration note above explains
  why its argument, though stronger for Agonara's CSRF/idempotency handshake than
  for the post's own bearer-token case, still does not justify a *mandatory* CLI
  binary against the runtime-free BYOA assumption.
- **A machine-readable application *descriptor* / resource-topology map.**
  Targets a multi-service homelab. Agonara is a single Node app whose topology is
  already encapsulated behind its own API, and live inventory is intentionally
  kept out of the repo (`docs/deployment-discipline.md`).
- **The base-infra layer** (Incus / k3s / Argo CD / Loki / Prometheus, etc.).
  Homelab platform engineering, orthogonal to Agonara the product — except where
  `loki` becomes the diagnose sink above.
- **The multi-role agent taxonomy** (operator / platform-developer / deployer,
  part №4). It maps to a multi-service homelab with separate infra ownership.
  Agonara is a single Node app; minting four agent roles would invent structure
  the product does not have. The *mechanism* — role-scoped command discovery —
  transfers (Idea 1); the *specific roles* do not.

## Net-new in part №4, deliberately deferred (ops-side, not BYOA substrate)

Part №4 adds two genuinely new concepts. Both are operational, not part of the
agent-facing API, so they are recorded here rather than promoted to forward tasks.

- **A scheduled monitor agent** (24/7: auto-fix small things via PRs, file richer
  bugs with span/log links). Presupposes the alerting/telemetry stack Agonara has
  deferred (`loki` on hold). Revisit only after the diagnose bundle and a
  logging sink exist.
- **A break-glass path** — separate, on-demand instructions for direct server
  access during a disaster. Real operational hygiene, but it belongs with
  deployment discipline behind the loopback-only admin boundary
  (`agent-connectivity.md`), not in the BYOA API surface. Tracked here so the
  reasoning is recorded, not silently dropped.

## Cross-cutting principle worth formalizing

The post's clearest articulation is the **"platform owns repeatable processes"**
rationale: hand repeatable multi-step processes to the platform so the agent
takes fewer steps, does fewer manual actions, and **does not pollute its context
with topology details** — and so topology/component changes happen platform-side
without rewriting agent instructions. Agonara does this implicitly; stating it as
an explicit design principle (in the BYOA design brief,
`docs/plans/implemented/byoa-operator-skills.md`) would guide future decisions
about what belongs in the API/platform versus in a skill. Tracked as a forward
task in [`skills.md`](skills.md).
