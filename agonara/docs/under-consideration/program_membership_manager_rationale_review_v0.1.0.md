---
title: Agonara Program Membership Manager Rationale — Peer Review
description: Peer review of the Program Membership Manager rationale; identifies the load-bearing role-vs-narrative ambiguity and lists downstream documents that should be revised once the decision lands.
model: claude-opus-4-7
version: 0.1.0
date: 2026-05-27
---

# Agonara Program Membership Manager Rationale — Peer Review

## Status

Under consideration. Peer document to [program_membership_manager_rationale_v0.1.0.md](program_membership_manager_rationale_v0.1.0.md). Both documents are parked here until the role-vs-narrative decision is taken.

## Scope

Reviews the rationale for introducing `Program Membership Manager` as the actor for the `Program Membership` module. Does not propose final wording for downstream documents; lists what would need to change once the open decision is closed.

## Verdict

Direction is sound. The "missing-actor" problem is real: once ADR-004 accepts Program Membership as a peer module, writing every participation story as `As an Admin…` or `As a Program Curator…` pulls operational and content roles into membership lifecycle and erodes the module boundary the ADR just established. The actor-symmetry argument is a legitimate cure for that drift.

One load-bearing ambiguity blocks the downstream cascade. It must be resolved before the module map, Pre-ADR, story catalogs, or ADR-002 are patched.

## Strengths

- The Options A–D pressure test (admin / curator / student / no-actor absorbing membership) is the right shape of argument and reaches the right conclusion.
- The rejection notes for alternative names (Admission Officer, Admissions Manager, Program Coordinator, Program Registrar, Enrollment Manager, Membership Manager) are thorough and reason explicitly about scope rather than aesthetics.
- The exclusions list ("does not own identity lifecycle / corpus / answers / mastery…") is consistent with the module responsibility map and ADR-004.
- The contextual shorthand rule (`Manager` only when `Program Membership` is the active context) is sensible and prevents collisions with other "manager" terms.

## Load-bearing ambiguity: role vs narrative actor

The rationale does not decide whether `Program Membership Manager` is:

- **(a) a narrative actor** — a story-writing device personifying the module, with no identity/role-system semantics, no grant flow, and no place in ADR-002's role vocabulary; or
- **(b) a real role** — grantable to an Identity, with explicit scope (instance? Program? policy?), creation/grant flow, recovery surface, and a corresponding amendment to ADR-002.

Evidence of (a) in the doc: "in contexts where the module is already clear, this actor may be shortened to `Manager`"; the patch guidance section names docs to update but not identity-system surfaces; no creation/grant story is proposed.

Evidence of (b) in the doc: the `## Role Definition` section uses the word "role" and lists operational verbs ("may manage invitations, membership status, participant lists…"); the example user stories use `As a Program Membership Manager` in the canonical agent slot.

These cannot both be true without further specification. The decision determines:

- whether ADR-002's role vocabulary is currently incomplete (case b) or correct (case a);
- whether a Manager story catalog must exist (case b) or must not exist as an independent catalog (case a);
- whether Manager may appear in identity/role administration paths (case b) or is forbidden from them (case a).

## Story overlaps not resolved by the rationale

Several Manager responsibilities overlap with existing actors' stories. The rationale acknowledges this in passing ("Curator stories should mention membership only when the selected membership policy explicitly gives the curator that action") but does not enumerate which existing stories move, stay, or get policy-scoped:

- **CUR-14 — Invite student to program** vs. Manager's "may manage invitations." Under curator-invited policy this is curator work; under other policies the invitation sender is unowned by the current story set.
- **STU-22 / STU-23 — Accept / decline invitation.** The student side is clear; the sender side is unowned unless Manager (or policy-scoped Curator) owns it.
- **CUR-15 / CUR-16 — See invited / see participants.** Pure visibility actions; in policies where the curator does not run invitations these read more naturally as Manager visibility.
- **CUR-17 — Remove student from curator-controlled program** vs. Manager's "revoking or recovering participation." The policy boundary between curator removal and Manager revocation needs an explicit rule.
- **ADM-13 / ADM-14 — Admin exceptional recovery and revocation.** Already scoped as exceptional, but the boundary between *exceptional admin recovery* and *normal Manager revocation* needs to be stated, not implied.

## Smaller observations

- The `## Role Definition` section reads as a role specification (subjects, verbs, exclusions). If the final decision is (a) narrative actor, this section should be retitled (e.g., `## Actor Scope`) and explicitly state that no identity grant exists.
- The rationale drafts three example user stories but does not propose where they should live. If (b), they need a catalog file; if (a), they should be folded into the Manager-perspective slots of the Program Membership Pre-ADR or the existing story catalogs.
- The patch guidance section names target docs but does not enumerate story migrations or version bumps.

## Required decisions

1. **Manager is a role (b) or a narrative actor (a)?** This is the single blocking decision.
2. If (b): what is its scope (instance / Program / policy), how is it granted, who may grant it, and how does it recover?
3. If (a): which existing actor performs each Manager-attributed operation under each membership policy? In particular, who is the invitation sender under non-curator-invited policies?
4. Either way: what is the explicit rule separating Admin exceptional recovery from normal Manager revocation?

## Downstream impact (gated on the decision above)

Once the role-vs-narrative decision lands, the following documents are candidates for revision. None of these should be touched before the decision.

| Document | Why it would change |
|---|---|
| `program_membership_manager_rationale_v0.1.0.md` | Add an explicit role-vs-narrative declaration; refine `## Role Definition` accordingly; bump to 0.1.1. |
| ADR-002 (`role-authority-scope-model`) or a new ADR-006 | If (b): amend ADR-002 to add Manager with scope, grant source, and recovery. If (a): author a short ADR explicitly stating Manager is a documentation device and has no identity grant. |
| `program_membership_pre_adr_v0.1.0.md` | Add a `Primary actor` subsection; reflect the role-vs-narrative decision; bump version. |
| `module_responsibility_map_v0.4.1.md` | Add a primary actor entry for Program Membership; reconcile `## Product role and membership rules` with the decision; bump version. |
| `curator_user_stories_v0.3.0.md` | Scope CUR-14 through CUR-18 to the membership policies that actually authorize curator participation; migrate visibility/management stories to Manager if (b); bump version. |
| `admin_user_stories_v0.2.1.md` | Reaffirm ADM-12 through ADM-15 as exceptional; add the explicit Admin-vs-Manager boundary rule; bump version. |
| `student_user_stories_v0.3.1.md` | Update Terms to reference Manager; reaffirm STU-22 / STU-23 as student actions on invitations whose sender is decided by policy; bump version. |
| New: Manager-perspective story catalog | Only if (b). Lift the three example stories from the rationale and add policy-execution and status-management stories. |
| `intent_learning_program_app_v0.3.0.md` | Surface Manager in the Product Intent only if (b). |
| `agonara/docs/log.md` | Add an entry once the decision lands and the cascade begins. |
| `agonara/docs/backlog.md` | Track the open decision and the cascading revisions. |

## Suggested sequence

1. Decide (a) or (b). Capture in this folder.
2. Update the rationale doc with the decision; move both documents out of `under-consideration/`.
3. Land the ADR (amendment or new) so the role vocabulary is authoritative.
4. Update the Pre-ADR and the module responsibility map.
5. Update the three story catalogs (Student / Curator / Admin) in parallel.
6. Author the Manager story catalog if (b); otherwise skip.
7. Update Product Intent only if (b).
8. Append a log entry; close the backlog item.
