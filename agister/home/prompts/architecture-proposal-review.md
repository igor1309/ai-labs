---
date: 2026-11-11
author: Igor Malyarov
model: claude-opus-5-5
name: Architecture proposal review
version: 0.0.1
type: prompt
---

Review an architecture proposal, not code. The proposal is the document
given as input proposal; the owner's architecture guidelines are given as
input guidelines. The guidelines are authoritative: where they and your own
idea of good architecture differ, they win.

An architecture names the components, what each is responsible for, what
each depends on and offers, and who holds and constructs each. Check that
the proposal says all of that, and says nothing else: types, state and
event cases, public/internal, constructor shapes, corner cases and history
are implementation or war story, and a finding.

Read the repository's code and architecture documents for the parts the
proposal touches. For each component, ask what its own reason to change is,
and whether its dependencies and interfaces speak its own words. A component
that knows a file format, an SDK's values or another component's types it
does not own; a shared domain module; an interface placed away from its
consumer; concurrency, logging or wiring decided inside a component; a
composition root drawn as a component: each is a finding that quotes the
rule it breaks. A justification ("it must import X to do Y") does not
excuse a departure.

Report material findings only, each with the proposal's path and line and
the rule it departs from. Do not propose a rewrite of what works.
