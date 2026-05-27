# Log

## 2026-05-27

- Add the operational walking skeleton: request ID propagation, unauthenticated health, unauthenticated diagnostics rejection, structured completion logs, and redacted fault responses.
- Start implementation with the Agonara backend workspace skeleton, per-project CI handoff, and Docker container-start smoke path.
- Close docs handoff gaps by making Dockerized private self-hosting an explicit implementation gate and registering Agonara in the repo dashboard surfaces.
- Harden the Identity and Operations implementation plan with explicit substrate assumptions, dependency API verification, direct ADR links, and executable diagnostics sequencing.
- Add the Identity and Operations first-slice implementation plan, sequencing Agonara identity, API/CLI, operational, backup/restore, and executable acceptance work behind explicit process gates.
- Harden the operational cross-cutting spec with concrete request ID validation, diagnostics rejection mapping, coarse diagnostic reasons, required log correlation, and bounded component names.
- Add the v0.0.1 operational cross-cutting spec so request IDs, diagnostic logs, health, diagnostics, redaction, and audit/log boundaries have an implementation handoff.
- Harden the Identity & Role Management API/CLI spec with audit-event shape, JSON stdin bootstrap, login disclosure protection, and auth rate-limit contracts.
- Add the Identity & Role Management API/CLI spec so first-slice implementation has explicit HTTP, operator CLI, and executable acceptance contracts.
- Add the Identity & Role Management v0.0.1 implementation spec, translating accepted identity/Admin/auth ADRs into command, query, state, test, and done-criteria handoff.
- Remove version suffixes from active and archived Agonara Markdown filenames while preserving front-matter versions, reducing reference churn from routine document updates.
- Accept ADR-008 for first-slice authentication, session, credential binding, and first-Admin bootstrap boundaries so Identity & Role Management can move toward implementation planning.
- Move accepted Agonara ADRs into `agonara/docs/adr/` so project architecture decisions live with the rest of the Agonara documentation tree.
- Accept ADR-007 for the effective participation authorization contract: Student, Curator, Admin, and future application services must ask Program Membership for allowed/denied participation instead of reading membership policy internals.
- Contain the ADR-006 follow-up: Program Membership Manager remains in the membership decision trail, while student, curator, and admin story catalogs stay at their existing versioned ownership boundaries.
- Accept ADR-006 for Program Membership policy actor: Program Membership Manager is narrative only, v0.0.1 Student self-join is allowed for active identities, and no new grantable role is added.
- Park the Program Membership Manager rationale in `under-consideration/` and add a peer review identifying the role-vs-narrative ambiguity as the blocking decision before the module map, Pre-ADR, story catalogs, and ADR-002 (or a new ADR) are revised. Track parked docs and their gating decisions in `backlog.md` so the folder does not go stale.
- Accept ADR-005 for Program Membership state and first admission policy: Students can join self-join Programs, rejoining after leave reuses membership history, and Program Curator self-join stays closed for the first implementation.
- Align admin and identity docs with ADR-004: product participation is now described as Program Membership-owned, while Identity & Role Management keeps identity, credentials, Admin authority, audit, and recovery primitives.
- Accept ADR-004 for Program Membership ownership: participation lifecycle and policy now belong to a separate module, with effective Student and Program Curator authority backed by membership grants.
- Add Program Membership Pre-ADR to pressure-test the separate module, opaque membership policy boundary, and unresolved role/membership authority contract.
- Add Program Membership to the module responsibility map as a peer module owning participation lifecycle, policy, invitations, visibility, and exceptional recovery hooks.
- Add Program Membership stories across student, curator, and admin catalogs so participation lifecycle, invitation, recovery, and audit gaps are explicit.
- Accept ADR-003 for Agonara admin recovery: private instances must retain effective Admin control and audit sensitive identity-management operations.
- Accept ADR-002 for Agonara role scope: product roles are Program-scoped, Admin is instance-scoped operational authority, and credentials grant no roles.
- Accept ADR-001 for Agonara identity ownership: internal Identity is now the stable subject for ownership, action, attribution, and authorization context.
- Tighten admin story traceability: Product Intent now points at module map v0.3.1, and the module map names ADM-01 through ADM-11 as Identity & Role Management drivers.
- Add admin user stories (v0.1.0) and link them from Product Intent (v0.3.0) and the identity first-slice Pre-ADR (v0.2.1), closing the admin traceability gap.
- Align Agonara docs with My Way audit: Product Intent (v0.2.0), story catalogs (v0.2.0), deployment target (v0.2.0), Pre-ADR framing, research notes (v0.2.0), and supporting metadata now expose required structure and traceability.
- Improve module responsibility map (v0.3.0): refine module boundaries, ownership rules, embedded behaviors, and cross-cutting responsibilities.
- Develop identity & role management first slice (v0.2.0): authorization principles, identity lifecycle, capabilities table, consistency rules, deferred decisions.

## 2026-05-26

- Seed agonara project: product intent (learning program app with curator/student separation), curator and student user stories, module responsibility map (four modules: Corpus Storage, Curator Workspace, Student Workspace, Identity & Role Management), identity & role management first slice, deployment decision (dockerized private self-hosted), implementation notes (identity/auth mapping sketch), brand briefs (EN + RU).
