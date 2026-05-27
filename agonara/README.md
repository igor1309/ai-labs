---
date: 2026-05-26
description: "Agonara — structured learning program environment with curated programs, learner progression, and evidence of mastery"
---

# Agonara

Structured learning program environment.

## Description

Helps curators assemble and maintain learning programs from trusted sources, while learners progress through them with clear sequence, checkpoints, and evidence of mastery. AI assists program construction and learning support but does not own the curriculum.

## Stack

- Early-stage design (no implementation yet)

## Key Separations

- **Program corpus** (topics, concepts, materials, checks, criteria) is owned by the curator
- **Student state** (answers, attempts, progress, weak areas) is owned by the learner
- **LLM output** is assistant material until a human accepts it

## Docs

| Document | Phase | Description |
|----------|-------|-------------|
| `docs/intent_learning_program_app_v0.1.0.md` | Product Intent | Problem, roles, user needs, boundaries |
| `docs/agonara_curator_user_stories_v0.1.0.md` | Product Intent | Curator user stories |
| `docs/agonara_student_user_stories_v0.1.0.md` | Product Intent | Student user stories |
| `docs/agonara_module_responsibility_map_v0.2.2.md` | Pre-ADR | Four-module boundary exploration |
| `docs/agonara_identity_role_management_first_slice_v0.1.1.md` | Pre-ADR | Identity & role management first slice |
| `docs/agonara-deployment-decision.md` | Pre-ADR | Deployment target direction |
| `docs/agonara-implementation-notes_v0.1.0.md` | Research | Identity/auth mapping sketch |
| `docs/brand/agonara_brand_brief_v0.1.0.md` | Supporting | Brand brief (EN) |
| `docs/brand/agonara_brand_brief_ru_v0.1.0.md` | Supporting | Brand brief (RU) |
