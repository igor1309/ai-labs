---
date: 2026-06-07
model: gpt-5
description: "Deferred design decisions and forward tasks for Agonara."
version: 0.0.15
---

# Backlog

## Agent Process and Skill Improvements

### Implementation adversarial review skill

Create a focused skill for post-implementation adversarial review. The skill
should check implemented changes against the accepted spec, plan, tests, and
runtime boundaries before closeout commits.

Context from the OpenAPI automation session: the implementation review caught a
metadata shape mismatch (`openApiContractMetadata.components.parameters`) and a
missing test that every registry `handlerKey` prefix is covered by server
dispatch. A reusable skill should make those checks mechanical:

- enumerate spec behavior rules and public interface types against implemented
  exports;
- check generated-artifact source-of-truth loops and server-only field leakage;
- verify runtime import boundaries, especially when generators depend on
  development-only packages;
- confirm route/handler registries have coverage tests that prove the registry
  reaches dispatch, not just that a matcher accepts paths;
- produce fail/warning findings with exact file/line evidence and concrete
  fixes.

### Process-gates skill hardening

Tighten the process-gates and implementation-plan workflow so every plan phase
derives its validation commands from active repo instructions before writing the
phase.

Context from the OpenAPI automation session: the first implementation plan
listed targeted and workspace checks for code/generated-artifact phases but
omitted the root Node/TypeScript gates required by repo instructions. The plan
review fixed this after the fact. The skill should require a "gate extraction"
block that records:

- the exact active verification commands for the touched scope;
- whether Node 22 must be forced for the commands;
- which phases touch code, config, dependencies, CI, release files, or generated
  artifacts;
- a per-phase validation list copied from that extraction rather than rewritten
  from memory.

### Traceability-review negative-guarantee handling

Extend the traceability-review skill's `spec ↔ tests` pass for clauses that
state negative guarantees, such as "operator skills must not read source files".

Context from the OpenAPI automation traceability review: BR-23 was carried by
`operatorSkills_shouldOnlyCiteRoutesPresentInOpenApi_onSkillRouteReferences`,
but names-only traceability could not prove the absence guarantee that operator
skills do not depend on source files, tests, route handlers, or private runtime
modules. The skill should instruct reviewers to:

- classify negative guarantees explicitly;
- require a test title that states the absence when names-only traceability is
  expected;
- otherwise route the item to a body-level audit or doc-drift audit instead of
  leaving the next agent to infer the limitation.

### Review OpenAPI automation traceability open question

Review
`docs/traceability-reviews/2026-06-07T1825Z-spec-tests-openapi-automation.md`
and resolve OQ-1.

Context: the traceability review found no spec-to-test findings for OpenAPI
automation, but it recorded one names-only limitation for BR-23. The test
`operatorSkills_shouldOnlyCiteRoutesPresentInOpenApi_onSkillRouteReferences`
traces the positive requirement that operator skills cite published OpenAPI
routes, but the test title does not prove the negative guarantee that BYOA
operator skills do not depend on source files, tests, route handlers, or private
runtime modules.

Expected resolution:

- decide whether names-only traceability is required for this guarantee;
- if yes, rename or add a test whose title explicitly states that operator
  skills consume only the published OpenAPI contract;
- if no, run the appropriate body-level audit or doc-drift audit and record why
  the existing names-only limitation is acceptable;
- update or supersede the traceability review so the open question no longer
  remains as an unresolved forward task.

### OpenAPI automation migration skill

Create a reusable migration skill for converting a hand-edited OpenAPI contract
into a generated contract without changing runtime behavior.

Context from the OpenAPI automation session: the task needed a predictable
sequence that preserved `docs/api/openapi.yml` as the operator-facing substrate
while moving the source of truth into route declarations. The skill should cover:

- seeding a route contract registry from the current published OpenAPI contract;
- preserving existing route-level metadata, schemas, auth, request bodies,
  response envelopes, and rejection vocabularies;
- adding a deterministic generator and read-only `--check` mode;
- wiring the generation check into the project test gate;
- keeping generator-only dependencies out of runtime server imports;
- proving server dispatch is driven by registry matches and handler keys;
- running traceability from spec rules to test names.

### Environment preflight instructions for Node toolchains

Add a repeatable environment preflight step to relevant skills and plans:
inspect `.node-version`, package/toolchain files, and active shell versions
before running Node commands.

Context from the OpenAPI automation session: the local shell default used a
newer Node than Agonara's `.node-version`, while native dependencies such as
`better-sqlite3` were installed for Node 22. Future plans should record the
exact prefix for validation commands, for example
`PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`, and use it consistently
with `node`, `npm`, `npx`, and `./scripts/run_silent.sh` invocations.

## Under consideration

Documents parked in an `under-consideration/` folder need an owning decision before downstream docs are revised. Do not let that folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
