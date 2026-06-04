---
date: 2026-06-03
model: claude-opus-4-8
description: "Pending documentation structure tasks for the Agonara project"
---

# Agonara TODO

## 1. Consolidate loose docs under subfolders

Group the flat files in `docs/` into purpose-named subfolders, mirroring the existing `adr/` and `plans/` layout.

- **User stories** → `docs/user-stories/` (or, per the my-way convention, `docs/intent/`): `admin_user_stories.md`, `curator_user_stories.md`, `student_user_stories.md`, `user-stories.html`.
- **Pre-ADR notes** → `docs/pre-adr/` (sibling to `adr/`): `program_membership_pre_adr.md`.
- Decide the home for the remaining loose intent/notes files (`intent_learning_program_app.md`, `implementation-notes.md`, `module_responsibility_map.md`, `deployment-target.md`, `backlog.md`) while consolidating.
- Update any links in `README.md`, `log.md`, and cross-referencing docs after moving.

## 2. Add `agonara/index.md`

Create a project index that maps the documentation tree (ADRs, specs, pre-ADRs, user stories/intent, plans, demos) so the README can point to a single discovery doc instead of enumerating links.
