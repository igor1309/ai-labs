---
date: 2026-11-08
model: gpt-6
description: "Spec: one student's reading session shared by web and Telegram"
---

# Spec: Reading session

## Goal

One student continues the same exploratory reading activity through web and
Telegram. Accepted corpus and consequential learning evidence remain unchanged.
The activity owns reading decisions; the session service owns serialized,
persisted state; each surface owns its transport and presentation.

## Public interface

The reading module consumes accepted catalog entries, navigation, entities and
material text through its own `Reader`. Its activity takes a session and a
command and returns semantic content, available actions, section position and
source paragraph references. It resolves explanation context without trusting a
browser's quoted text.

The session service takes an activity and a storage port at construction.
`Apply(context, command)` returns a snapshot after persistence;
`Explain(context, question)` returns capability availability and resolved source
context. A command optionally carries the revision it was rendered against. An
explanation requires a session revision, material ID, material revision and
paragraph reference.

Web consumes `Open(context, request)` and `Explain(context, question)` in its own
models. Telegram consumes `Show(context, request)` in message-oriented models.
Composition translates the requests, reading hierarchy, navigation and failures.
Neither surface imports the activity, HTTP content client or reading storage.

## Behavior rules

- Programs, program navigation and direct entity links steer the shared session.
  A direct material link builds its return path from the owning program and
  course. Opening the current material without a page resumes its current page;
  an explicit page is clamped to the material. Reading position remains available
  as a bookmark while browsing other screens.
- Pagination preserves source text apart from conversion front matter. Pages
  break at paragraphs and section boundaries where possible. Sections carry
  their first page, page count and current position. The activity supplies
  previous/next availability; surfaces only format the links and labels.
- A material revision is the SHA-256 of its source bytes. Paragraph references
  include that revision and the fragment's source byte offset, distinguishing
  repeated paragraphs. Browser paragraph numbers and quote text are not identity.
- Explanations resolve the current source fragment and report unavailable until
  a Brain is supplied. Unknown actions or references are rejected. No canned
  answers or learning-evidence writes are produced.
- Actions run serially, including content access and persistence. A stale session
  revision is rejected before activity execution. A revision-bound move within a
  changed material is rejected. Explanations also validate the material revision.
- A failed action, invalid result or failed save leaves the last committed state
  intact. A successful action advances the session revision once. Explanation
  requests leave reading state and revision unchanged. Transport delivery occurs
  after commit: a failed message delivery can be recovered by requesting the
  current screen, without rolling back another surface's reading state.
- The file adapter atomically replaces private JSON through a synced temporary
  file. Corrupt or unreadable selected state fails startup. Migration chooses an
  existing shared file first, otherwise the web place, otherwise the bot session,
  otherwise the program list. Legacy files are never overwritten or deleted.
  Telegram offset and displayed-message revision migrate to a separate file.
- The normal runner owns one service instance and one poller. Required settings
  and distinct absolute state paths are checked before startup. Kernel locks
  prevent overlapping owners and local pollers. Standalone web requires its own
  explicit state path and does not poll Telegram.
- URLs, cookie-token exchange, escaped content, existing assets, long titles,
  sections, topic/module placement, rich-message rendering and plain fallback
  remain surface behavior. Paragraph actions and Telegram callbacks carry session revisions; direct page
  URLs express an absolute position and remain refreshable. Stale web actions
  return 409 and stale Telegram buttons are
  acknowledged without applying an action.
- The content gateway caches successful reads for five minutes, using an
  injected clock; it never caches errors. Both surfaces share that instance.
- Deployment stages and validates the binary before stopping services. The first
  handoff is explicit. Legacy web and bot jobs stop before the combined runner
  starts; standalone web is disabled for normal deployment. Failed activation
  restores the previous binary and services. Rollback uses legacy files and
  checks restored availability rather than the failed runner's version.

## Tests

- Reading tests exercise pagination, contents, exact accepted content, stable
  source references, unavailable explanations and collaborator failures.
- Service spies exercise serialization, competing revisions, failed saves,
  source changes, isolated state values and explanation payloads.
- Surface spies verify transport requests, escaping, access guard, unavailable
  explanations, stale actions, long labels, outline placement and fallback.
- Composition tests verify both directions of each boundary and error mapping;
  shared-service tests exercise switching surfaces, concurrent actions and
  filesystem restart. HTTP rendering uses controlled data without a listening
  socket or a Telegram request.
- Filesystem tests use temporary directories for precedence, preserved legacy
  bytes, corrupt state, failed replacement and owner locks. Deployment contract
  tests run the shell against isolated process spies for activation and rollback.
- A test over the actual Go import graph and source syntax enforces dependency,
  consumer-interface and test-execution boundaries.

## Done criteria

The contracts remain consumer-owned, all behavior above is covered, the module
passes formatting, vet, race tests and command builds, and deployment checks run
without touching live services.
