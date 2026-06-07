---
date: 2026-06-07
model: claude
description: "Forward tasks for Agonara's BYOA operator-skill product — distribution, versioning, and discovery of the per-role operator skills."
---

# Backlog — BYOA Operator Skills

Forward tasks for the **BYOA operator-skill product**: the per-role skills an
operator loads to drive an Agonara instance (foundations + curator bucket +
student + admin, all implemented). This is distinct from
[`dev-skills.md`](dev-skills.md), which tracks the *agent's own* process and
toolchain skills — agent-process skill work (the adversarial-review skill, the
OpenAPI-automation migration skill, the traceability negative-guarantee, etc.) is
owned there, not here.

Design source of truth:
[`../docs/plans/implemented/byoa-operator-skills.md`](../docs/plans/implemented/byoa-operator-skills.md).

## Skill discovery, publishing, and packaging

The brief's deferred open question #1 — the operator skills exist in-repo with no
distribution story: how does an operator *find and load* the skill for a job?

- **Packaging / home.** Decide whether skills ship **with the instance** (served
  by the API, versioned with the contract) or as **standalone installables** an
  operator pulls in. The choice shapes where a skill may assume it runs.
- **Versioning surface.** How a skill version is declared and matched to an
  instance/contract version.
- **Discovery / install flow.** How an operator finds the right skill and loads
  it into their agent (marketplace, install command, or instance-served listing).

Design work, not a content skill. Sequence it **after** the `dev-skills.md`
hardening items (the traceability/drift guards, the adversarial-review skill, and
process-gates): packaging decisions are easier to make against a skill set known
correct and drift-guarded.
