# Log

## 2026-05-28

- Harden the accepted corpus HTTP API after adversarial review by covering disabled sessions, unknown Programs, filter-scoped cursors, and Student/Curator/Admin historical revision reads.
- Complete the Corpus HTTP API accepted corpus read phase with Student/Curator/Admin authorization, accepted-kind filtering, bounded pagination, current-revision listing, historical revision lookup, and draft/rejected candidate exclusion coverage.
- Harden the Corpus acceptance/rejection HTTP API after adversarial review by rejecting unknown acceptance body fields and covering rejected Corpus events for resolved acceptance/rejection failures.
- Complete the Corpus HTTP API acceptance/rejection route phase with explicit curator-only state transitions, CSRF-before-mutation checks, target validation, current-revision replacement, historical revision preservation, and Corpus event coverage.
- Harden the Corpus candidate HTTP API after adversarial review by adding route-specific default pagination coverage and rejecting non-string source identifiers as malformed request input.
- Complete the Corpus HTTP API candidate route phase with curator-only candidate listing/creation, status-filtered pagination, CSRF-before-mutation coverage, source ownership rejection mapping, and draft isolation from accepted corpus.
- Complete the Corpus HTTP API Program source route phase with HTTP coverage for Program-scoped source listing, curator-only access, unknown Program rejection, CSRF-before-mutation behavior, accepted source creation events, and source validation failures.
- Start the Corpus Storage and Curator Acceptance HTTP API implementation with the Phase 1 transport substrate: dedicated worktree preflight, Corpus command composition, session-backed source route dispatch, Corpus status mapping, shared list pagination, and strict Corpus JSON body classification.
- Add the Corpus Storage and Curator Acceptance HTTP API implementation plan, sequencing the route adapter work through strict TDD phases for shared transport helpers, source routes, candidate routes, acceptance/rejection, accepted corpus reads, Corpus events, and executable closeout.
- Harden the Corpus Storage and Curator Acceptance HTTP API spec after adversarial review by removing backup-only rejection reasons from the HTTP contract, making rejection request-body handling explicit, and bounding all Corpus list routes with opaque cursors.
- Add the Corpus Storage and Curator Acceptance HTTP API spec, carrying the implemented domain contract into session-backed routes, CSRF enforcement, response envelopes, redaction, scoped event and candidate pagination, and executable acceptance scenarios.
- Harden the Corpus acceptance implementation after adversarial review by adding rejected Corpus events for resolved state/target failures and rejecting restore graphs where accepted revisions point to missing entities or unaccepted candidates.
- Complete the Corpus Storage and Curator Acceptance first slice with executable domain acceptance coverage, draft/rejected isolation and out-of-scope surface guards, and archived implementation-plan closeout.
- Harden Corpus event queries and response redaction: Program Curator access is required, events remain Program-scoped read-only records, rejected acceptance/rejection commands are recorded when actor and Program resolve, and Corpus responses stay free of secret/session/infra details.
- Extend Agonara backup/restore to preserve Program sources, Corpus candidates, accepted corpus entities/revisions, and Corpus events, while rejecting invalid accepted-corpus graphs before restore.
- Implement explicit Corpus candidate acceptance into stable accepted entities and revisions, including current-revision replacement, historical revision reads, and accepted-corpus read authorization.
- Implement Curator Workspace candidate creation, listing, and rejection over the Corpus boundary, preserving draft/rejected candidate separation and candidate Corpus events.
- Implement the first Corpus command/query boundary for Program source recording and listing, including effective curator authorization, validation, source persistence, and Corpus source events.
- Implement the Corpus Storage persistence substrate for Program sources, Corpus candidates, accepted corpus entities/revisions, and Corpus events, with storage-level Program scoping and current-revision integrity checks.
- Add the Corpus Storage and Curator Acceptance first-slice implementation plan, sequencing storage, source, candidate, acceptance, backup/restore, event, and executable acceptance work through strict TDD phases with per-phase green-gate commits.
- Add the Corpus Storage and Curator Acceptance first-slice spec, defining source records, curator topic/concept candidates, explicit acceptance into stable accepted revisions, accepted corpus reads, and required tests.
- Accept ADR-010 for the Corpus Storage / Curator Workspace boundary: accepted Program corpus and stable accepted revisions belong to Corpus Storage, while drafts, candidates, LLM suggestions, and review state remain in Curator Workspace until explicit curator acceptance.
- Implement the Program Shell and Membership HTTP API, covering session-backed Program shell routes, Student membership join/leave/rejoin, effective participation checks, scoped event pagination, and executable acceptance coverage.
- Harden the Program Shell and Membership HTTP API implementation plan after adversarial review by fixing mandatory heading order and making early status/session coverage explicit.
- Add the Program Shell and Membership HTTP API implementation plan, sequencing the route adapter work through strict TDD phases with per-phase green-gate commits and explicit done criteria.

## 2026-05-27

- Harden the Program Shell and Membership HTTP API spec by separating domain event rejection reasons from transport rejections, restoring effective-participation denial coverage, and tightening malformed JSON and traceability expectations.
- Add the Program Shell and Membership HTTP API spec, carrying the implemented domain contract into session-backed routes, CSRF enforcement, response envelopes, redaction, event pagination, and executable acceptance scenarios.
- Implement the Program Shell and Membership first slice: `createProgramShell` with atomic initial curator membership, `joinSelfJoinProgram` / `leaveStudentProgram` with active/left/removed transitions and idempotent active-join + rejoin reuse, read-only `getEffectiveParticipation`, Program and Program Membership event queries with Admin-or-curator authorization, and backup/restore coverage that refuses orphan Program shells without active curator participation.
- Restyle the Admin operations UI board to match the `docs/my-way/landing.html` dark, mono-accented look (palette, typography, hero pill, surface cards) while preserving every structural marker the admin-board HTTP tests assert on.
- Implement the private Admin operations UI board on `/admin`, covering first-Admin bootstrap, sign in/out, identity creation, local credential binding, disablement, Admin grant/revoke, operational access inspection, and audit event inspection through the existing Identity API.
- Add the Program Shell and Membership first-slice spec, translating ADR-009 and membership ADRs into command/query contracts, behavior rules, and required tests.
- Accept ADR-009 for Program shell ownership and initial curator participation: active identities can create self-join Program shells, Corpus Storage owns the shell, and Program Membership establishes initial curator participation.
- Update Agonara traceability links to point at the implemented Identity and Operations plan after closeout.
- Add the Admin operations UI board implementation plan, scoping the next Agonara slice to a thin private-instance board over the existing Identity HTTP API.
- Add packaged-bin CLI acceptance coverage and extend the Docker CI smoke to bootstrap the first Admin through the containerized HTTP API, fixing the CLI symlink entrypoint guard uncovered by that test.
- Update the Agonara README so the implemented Identity and Operations slice is directly runnable through CLI, HTTP, and Docker demo paths instead of still reading as design-only.
- Fix the Agonara CI Docker smoke so the runtime receives the required bootstrap secret while keeping local runtime fail-fast behavior intact.
- Complete the Identity and Operations first-slice implementation with executable acceptance coverage across CLI bootstrap, HTTP sessions, Admin flows, CSRF, rate limiting, request correlation, audit listing, and redaction.
- Add the minimum Identity backup/restore path for identities, local password credentials, Admin authorities, and audit history, while excluding active sessions and rejecting no-Admin restores.
- Add the first `agonara identity` operator CLI for bootstrap status and first-Admin bootstrap, with JSON stdin for secrets, JSON stdout envelopes, and defined exit codes.
- Add the first Identity HTTP API routes for bootstrap status, bootstrap, login, session resolution/logout, Admin identity creation, audit listing, CSRF, rate limiting, secure session cookies, and Admin diagnostics.
- Add Admin-protected Identity commands for identity creation, local password binding, disablement, Admin grant/revoke, operational access inspection, identity listing, and audit listing.
- Implement the Identity core commands for first-Admin bootstrap, local-password login, session resolution, and logout, including scrypt password hashes, seven-day server-side sessions, and bootstrap audit events.
- Add the Identity storage boundary with SQLite-backed schema initialization, credential uniqueness checks, session revocation state, audit event append/list behavior, and last-effective-Admin protection.
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
