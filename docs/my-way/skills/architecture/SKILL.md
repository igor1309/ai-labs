---
name: architecture
description: Design, discuss or review a software architecture the owner's way - components, their responsibilities, dependencies, interfaces and composition. Use before drafting or changing an ARCHITECTURE.md or an architecture ADR, when proposing how new work splits into components, when the owner asks "what is the architecture", when a change's blast radius or a circling review hints at coupling, and when reviewing an architecture proposal. Triggers on "architecture", "components", "composition root", "boundaries", "who holds", "who constructs", "blast radius", "reason to change".
---

# Architecture

`references/guidelines.md` holds the owner's rules in their own words. Read
it whole before you draft, discuss or review; where it and your own idea of
good architecture differ, it wins. Do not restate it elsewhere; point at it.

## What you produce

An architecture names the components, what each is responsible for, what
each depends on and offers (its interfaces, in its own words), and how they
are composed: who holds each and who constructs it. Nothing else. Types,
state and event cases, public/internal, constructor shapes and corner cases
are implementation; leave them out.

## Designing

1. Read the repository's architecture documents and the code first. Existing
   code, MVP notes, issues and earlier docs are evidence, not oracles.
2. Answer, concisely: what new responsibilities are there, how they split
   between components and why, who holds each, who constructs each.
3. For each component, ask what its own reason to change is. Two components
   that change for one reason, or one that changes for another's, is a wrong
   cut.
4. Put every outside concern (files and formats, devices, SDKs, frameworks,
   tools) in one wrapper or reader/writer at the edge; everything inside
   speaks its own language.
5. Compose in the composition root: adapters, mappers, decorators,
   concurrency and fakes are wired there.
6. Present it short, top level first, and wait for the owner's approval.
   Component specs, sub-issues and code come after.

## Reviewing

Check the proposal or code against every rule in the guidelines. A
departure is a finding that quotes the rule; a justification ("it must
import X to do Y") does not excuse it. Judge by language, not form: types of
its own that carry another component's words are no boundary. Read a wide
blast radius, unstable interfaces or tests that need real tools as evidence
of coupling, and name the dependency that carried it.

## Diagrams

Follow section 10 of the guidelines: one meaning per arrow with a legend,
interfaces beside their consumers, one abstraction level per diagram, the
composition root drawn dashed.
