---
title: Agonara Program Membership Manager Rationale
description: Rationale for introducing Program Membership Manager as the actor for the Program Membership module.
model: gpt-5.5-thinking
version: 0.1.1
date: 2026-05-27
---

# Agonara Program Membership Manager Rationale

## Status

Resolved by [ADR-006](../../../docs/adr/agonara/adr-006-program-membership-policy-actor.md): `Program Membership Manager` is a narrative and policy actor, not a grantable role. See peer review: [program_membership_manager_rationale_review_v0.1.1.md](program_membership_manager_rationale_review_v0.1.1.md).

This document is archived as decision input.

## Purpose

This document summarizes the discussion and rationale for introducing `Program Membership Manager` as the actor for the `Program Membership` module.

It is intended as input for updating:

- user stories;
- module responsibility map;
- Program Membership patch;
- Identity & Role Management first slice, if needed.

This document is not a data model, schema, UI specification, or implementation plan.

## Discussion Summary

Agonara now has a separate `Program Membership` module.

The module was introduced because program participation has its own lifecycle and should not be hidden inside `Identity & Role Management`, `Student Workspace`, or `Curator Workspace`.

`Program Membership` is responsible for participation lifecycle inside a program:

- joining a program;
- leaving a program;
- invitation lifecycle;
- membership status;
- participation visibility;
- revoking or recovering participation when needed;
- applying the selected membership policy.

This raised a missing-actor problem.

Other major systems already have a clear actor:

| System | Actor |
|---|---|
| Identity & Role Management | Admin |
| Curator Workspace | Program Curator |
| Student Workspace | Student |
| Program Membership | Program Membership Manager |

Without an actor for `Program Membership`, user stories for participation lifecycle have to be written from the perspective of `Admin`, `Program Curator`, or `Student`, even when the responsibility belongs to the membership system itself.

## Decision

Introduce `Program Membership Manager` as the actor for the `Program Membership` module.

In contexts where the module is already clear, this actor may be shortened to `Manager`.

Canonical name:

```text
Program Membership Manager
```

Contextual shorthand:

```text
Manager
```

## Actor Scope

`Program Membership Manager` manages participation lifecycle within a program.

The actor may represent Program Membership policy execution for:

- invitations;
- membership status;
- participant lists;
- join/leave flows;
- participation revocation;
- membership recovery cases;
- selected membership policy execution.

It does not own:

- identity lifecycle;
- credential bindings;
- admin role assignment;
- accepted program corpus;
- curator content decisions;
- student answers;
- assessment feedback;
- mastery, weakness, or progress interpretation.

## Rationale

### 1. Program Membership is a separate responsibility

Once `Program Membership` is treated as a separate module, its main actor should also be explicit.

Otherwise the module exists architecturally, but its user stories are forced through actors from neighboring modules.

That creates drift: membership behavior starts looking like admin work, curator work, or student work depending on which story is being written.

### 2. Actor symmetry improves document clarity

The current system map becomes clearer when each major module has a matching primary actor.

| Module | Primary Actor |
|---|---|
| Identity & Role Management | Admin |
| Curator Workspace | Program Curator |
| Student Workspace | Student |
| Program Membership | Program Membership Manager |

This symmetry is not cosmetic. It prevents ownership ambiguity in user stories and design documents.

### 3. Admin should not become the participation operator

Admin is an operational role.

Admin manages the private Agonara instance, identities, credential bindings, role assignments, settings, and recovery-level operations.

If `Admin` becomes the normal actor for program participation, operational authority leaks into product membership lifecycle.

Admin may handle exceptional recovery, but should not be the default actor for joining, inviting, leaving, or managing program participation.

### 4. Program Curator should not absorb membership responsibility by default

Program Curator owns content curation decisions.

If all participation management is written as curator work, the curator role expands from content responsibility into operational participant management.

That may be valid for a specific policy, such as curator-invited membership, but it should not be implicit in the role definition.

`Program Membership Manager` keeps participation management explicit and separable.

### 5. Student should not be the only membership actor

A student can join, leave, accept, or decline participation depending on the selected membership policy.

But the full lifecycle is broader than student action.

It can include invitations, revocation, status management, participant visibility, recovery, and future policy changes.

A separate actor avoids reducing membership to student self-service.

## What Happens If This Role Is Not Introduced

If `Program Membership Manager` is not introduced, one of the existing actors must absorb the missing responsibility.

### Option A — Admin absorbs membership

Problem:

- turns admin into a learning participation operator;
- mixes operational authority with product lifecycle;
- weakens the boundary between Identity & Role Management and Program Membership.

Result:

```text
Admin manages identities and also runs program participation.
```

This is not desirable.

### Option B — Program Curator absorbs membership

Problem:

- curator role expands beyond content curation;
- membership lifecycle becomes coupled to content ownership;
- self-join policy becomes awkward because the curator is not necessarily involved.

Result:

```text
Program Curator curates content and also owns participation by default.
```

This may be valid in curator-invited programs, but should not be forced globally.

### Option C — Student absorbs membership

Problem:

- works only for self-join;
- does not cover invitations, revocation, participant visibility, or recovery;
- makes controlled participation hard to express.

Result:

```text
Student starts/leaves programs, but no actor owns the rest of participation lifecycle.
```

This is incomplete.

### Option D — No actor; only module/system language

Problem:

- user stories lose a clear “As a...” actor;
- responsibility becomes procedural rather than actor-owned;
- documents become inconsistent with other modules.

Result:

```text
Program Membership exists as a module, but has no clear actor in user stories.
```

This is the main problem the role solves.

## Alternatives Considered

### Admission Officer

Rejected.

Reason:

- too narrow;
- implies admission or approval flow;
- does not naturally cover leaving, revocation, participant status, or general membership lifecycle;
- carries institutional education language that may be heavier than Agonara needs.

### Admissions Manager

Rejected for now.

Reason:

- better than `Admission Officer` if admission workflows appear later;
- still biased toward application/review/approval;
- not neutral enough for self-join and general membership lifecycle.

### Program Coordinator

Rejected as canonical term.

Reason:

- human-friendly and readable;
- but too broad;
- may imply scheduling, communication, logistics, program operations, or even partial curator responsibility;
- risks collision with `Program Curator`.

Could be considered later as a display label, but not as the canonical design-doc actor.

### Program Registrar

Rejected for now.

Reason:

- closer to enrollment and records;
- but still has academic/institutional flavor;
- focuses on registration records more than full participation lifecycle.

### Enrollment Manager

Rejected.

Reason:

- clear for joining/enrollment;
- too narrow for leave, revoke, invitation status, participant visibility, and recovery;
- over-focuses on the beginning of participation.

### Membership Manager

Rejected as canonical term.

Reason:

- concise;
- but too generic without program context;
- acceptable as shorthand only when context is already clear.

### Program Membership Manager

Accepted.

Reason:

- precise;
- directly maps to the `Program Membership` module;
- covers the full membership lifecycle;
- avoids admin/curator/student responsibility leakage;
- clear enough for user stories and architecture documents.

## Naming Decision

Use:

```text
Program Membership Manager
```

In documents where `Program Membership` is the active context, use shorthand:

```text
Manager
```

Do not use `Admission Officer` as the canonical role.

Do not use `Program Coordinator` as the canonical role.

## User Story Implication

Program Membership user stories can now use a clear actor:

```text
As a Program Membership Manager, I want to invite a student to a program so that participation is controlled through the selected membership policy.
```

```text
As a Program Membership Manager, I want to revoke a student's membership in a program so that invalid or outdated participation can be removed without changing identity lifecycle.
```

```text
As a Program Membership Manager, I want to see program participants so that I can manage participation separately from content curation.
```

Student-facing membership stories remain written from the student perspective.

Curator stories should mention membership only when the selected membership policy explicitly gives the curator that action.

Admin stories should cover exceptional recovery and audit, not normal participation management.

## Patch Guidance

### Responsibility Map

Add `Program Membership Manager` as the primary actor for `Program Membership`.

### Program Membership Patch

Update the Program Membership module section:

```markdown
Primary actor: Program Membership Manager
```

### User Stories

Create or update Program Membership stories around:

- Student;
- Program Membership Manager;
- Admin recovery/audit;
- Program Curator only where policy requires curator participation.

### Identity & Role Management First Slice

Do not make Admin the normal actor for program participation.

Keep Admin focused on operational role management, recovery, and audit.
