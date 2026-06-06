---
date: 2026-05-28
model: gpt-5
description: "Decision for Agonara Corpus Storage ownership and curator acceptance boundaries."
status: accepted
---

# ADR-010 - Corpus Storage and Curator Acceptance Boundary

## Executive Summary

Agonara separates accepted Program corpus from curator draft work.

Corpus Storage owns accepted Program corpus records and their stable accepted revisions.

Curator Workspace owns research intake, candidate content, draft suggestions, LLM suggestions, and acceptance decisions before they become accepted corpus.

Accepted corpus changes require an explicit `Program Curator` action for the Program and must preserve provenance back to the candidate or source material that justified the change.

Student Workspace reads accepted corpus for learning behavior but must not mutate it or own accepted corpus revisions.

This ADR decides the Corpus Storage / Curator Workspace boundary and minimum acceptance invariants only. It does not decide concrete corpus schema, UI, API routes, ingestion tooling, LLM prompts, assessment scoring, or database layout.

## Context

[ADR-001](adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal `Identity` as the subject of ownership, action, attribution, and authorization context.

[ADR-002](adr-002-role-authority-scope-model.md) establishes `Program Curator` and `Student` as Program-scoped product roles and `Admin` as instance-scoped operational authority.

[ADR-004](adr-004-program-membership-owns-program-participation.md) through [ADR-007](adr-007-effective-participation-authorization-contract.md) establish Program Membership as the owner of Program participation and effective participation checks.

[ADR-009](adr-009-program-shell-and-initial-curator-participation.md) establishes the accepted `Program` shell as the stable Program scope owned by Corpus Storage and initial `Program Curator` participation through Program Membership.

The [Product Intent](../intent/intent_learning_program_app.md) requires Agonara to keep shared Program content separate from each student's personal learning state. It also says LLM suggestions are assistance for a curator and are not accepted content until the curator accepts them.

The [Curator User Stories](../intent/curator_user_stories.md) require curators to add topics, concepts, materials, checks, criteria, sources, extracted candidates, coverage gaps, and LLM suggestions while keeping accepted content separate from drafts.

The [Module Responsibility Map](../module_responsibility_map.md) identifies Corpus Storage as the owner of accepted corpus and Curator Workspace as the owner of draft/research work. This ADR accepts the boundary for how candidate curation state crosses into accepted corpus.

The architectural tension is that accepted corpus must be stable enough for students to learn against while curator work must remain flexible enough to hold incomplete, speculative, or LLM-generated material. If candidate material and accepted corpus share one owner and state model, drafts can leak into the student experience. If acceptance history is mutable, later corpus edits can erase the evidence behind student attempts and curator decisions.

The rejected alternatives are storing accepted corpus inside Curator Workspace, treating LLM suggestions as accepted content by default, and allowing Student Workspace to own per-student copies of accepted corpus. Storing accepted corpus inside Curator Workspace weakens the accepted/draft boundary. Accepting LLM suggestions by default bypasses curator responsibility. Per-student corpus copies make shared Program evolution and student-state separation harder to preserve.

## Decision

Agonara MUST model accepted Program corpus as a Corpus Storage responsibility separate from Curator Workspace.

Corpus Storage MUST own accepted corpus records for a `Program`, including accepted topics, concepts, definitions, principles, material references, source metadata used by accepted content, accepted assessment items, and accepted assessment criteria.

Corpus Storage MUST preserve stable identifiers for accepted corpus entities and stable accepted revisions for changes that can affect student navigation, assessment, feedback, or progress evidence.

Curator Workspace MUST own research intake, candidate topics, candidate concepts, candidate materials, candidate checks, draft criteria, LLM-assisted suggestions, gap analysis, and curator review state before acceptance.

Candidate material, draft suggestions, and LLM suggestions MUST NOT be visible as accepted corpus until an explicit acceptance decision is made by an effective `Program Curator` for the Program.

Acceptance is the architectural boundary crossing from Curator Workspace into Corpus Storage. The acceptance decision MUST be attributable to the acting internal `Identity`, scoped to the `Program`, authorized through effective `Program Curator` participation, and connected to the candidate, source, or rationale that justified the accepted corpus change.

Student Workspace MUST read accepted corpus through Corpus Storage and record student-specific attempts, answers, feedback, evidence, mastery state, weak areas, and history separately from accepted corpus.

Student Workspace MUST NOT mutate accepted corpus, own accepted corpus revisions, or turn personal learning state into accepted Program content.

Admin authority remains operational recovery authority. Admin authority MUST NOT by itself accept Program corpus content or replace curator responsibility for accepted content.

## Rules / Invariants

- Corpus Storage owns accepted Program corpus.
- Curator Workspace owns candidate and draft curation state before acceptance.
- Student Workspace owns learner state and MUST NOT own accepted corpus.
- Program Membership owns `Program Curator` participation and effective participation checks used to authorize acceptance.
- Identity & Role Management owns internal identities, credentials, and `Admin` authority; it MUST NOT own accepted corpus or curator acceptance decisions.
- Accepted corpus MUST be scoped to a stable `Program` shell.
- Candidate material MUST be scoped to the Program it may affect before it can be accepted into that Program's corpus.
- LLM output MUST remain candidate material until accepted by an effective `Program Curator`.
- External source extraction MUST create candidate material or source metadata before it creates accepted corpus.
- Accepted topics, concepts, definitions, principles, material references, source metadata used by accepted content, accepted assessment items, and accepted assessment criteria MUST live in Corpus Storage.
- Research notes, extracted candidates, draft suggestions, LLM suggestions, proposed criteria, coverage gaps, and review state MUST live outside accepted corpus until acceptance.
- Acceptance MUST be an explicit action.
- Acceptance MUST be authorized through effective `Program Curator` participation for the Program.
- Acceptance MUST be attributable to the acting internal `Identity`.
- Acceptance MUST preserve provenance to the accepted source, candidate, draft, LLM suggestion, or curator rationale that justified the change.
- Acceptance MUST create or update accepted corpus through a stable accepted revision, not by silently overwriting historical accepted state.
- Accepted corpus revisions that have been referenced by student attempts, assessment feedback, or progress evidence MUST remain addressable.
- Student attempts, answers, feedback, evidence, mastery state, weak areas, and learning history MUST reference accepted corpus rather than copy ownership of accepted corpus.
- Updating accepted corpus MUST NOT erase or rewrite existing student learning history.
- Draft rejection MUST NOT delete accepted corpus.
- Candidate deletion or cleanup MUST NOT remove accepted corpus revisions or student references to accepted corpus.
- Admin recovery MAY repair broken corpus or acceptance records in a later ADR-defined exceptional flow, but it MUST preserve attribution and MUST NOT become the ordinary acceptance path.
- Later ADRs MAY define concrete corpus schemas, resource-level permissions, source ingestion, material storage, LLM workflows, acceptance APIs, UI, and migration strategy only if they preserve Corpus Storage ownership of accepted corpus and Curator Workspace ownership of draft curation state.

## Consequences

The accepted corpus boundary is now stable enough to specify the first corpus implementation without mixing drafts, LLM suggestions, and student state.

Curator Workspace can remain optimized for incomplete research and review work, while Corpus Storage can remain optimized for stable Program content used by students and assessments.

Acceptance becomes a first-class architectural transition. Implementations must record who accepted content, under which Program, and from which source or candidate.

Stable accepted revisions add complexity, but they protect student evidence and make later Program evolution safer. A student attempt can keep pointing at the version of a topic, check, or criterion that existed when the attempt happened.

LLM assistance remains useful without becoming an authority source. Generated material can accelerate curation, but a Program Curator remains responsible for accepted content.

Future specs must decide the smallest accepted corpus shape that is useful for the next slice. A narrow first implementation can start with Program-scoped source records and accepted topic or concept records, but it must keep the accepted/draft/revision boundaries intact.

## Non-Goals

This ADR does not decide:

- concrete database tables, columns, migrations, or storage layout;
- exact accepted corpus schema for topics, concepts, materials, checks, or criteria;
- whether assessment remains embedded in Student Workspace or becomes a later module;
- source ingestion tooling;
- source reliability scoring;
- material file storage, copying, scraping, or citation format;
- LLM prompt design, model choice, or evaluation workflow;
- Curator Workspace UI;
- Student Workspace UI;
- Program corpus API route names;
- implementation plan phases;
- content licensing policy;
- collaborative editing, branching, merge, conflict-resolution, or publication workflows;
- organization, team, tenant, classroom, cohort, or enterprise content governance.
