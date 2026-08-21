---
name: doc-discipline
description: Use before drafting or restructuring an ADR, spec, grounding or research note, plan, tracker or log entry; before citing a commit in durable prose; before adding a link between two docs; and when retiring a plan or tracker that others link to. Triggers on "write the doc", "review the doc", "cold-reader pass", "should this doc link to", "cross-link", "link the docs", "retire the plan", "delete the tracker", "supersede the doc", "cite the commit", "reference the SHA", "log entry".
allowed-tools: Read, Write, Edit, Grep, Glob
author: Igor Malyarov
version: "1.0.0"
---

# Docs

## Shape

- **Progressive disclosure**: project docs (ADRs, specs, notes) lead with the shape/destination in the first screen; rulings and details come below. Lead sections stay tight.
- **Cold-reader pass**: review docs for legibility separately from correctness — re-read as someone with zero session context and check the big picture lands in the first screen. Frontmatter descriptions included (e.g. "the Brevio acquisition component" read as "Brevio = acquisition component").

## Prose economy

Before keeping a sentence, ask what breaks if it is deleted. Defending a rule,
announcing what the document is not doing, and enumerating which parts of a
referenced file apply all break nothing — the last also implies the unlisted
parts do not.

## Linking

- **Links point one way: from the churning doc toward the stable one.** A reference doc — grounding, contract, research note — must never link to a plan, tracker, status or backlog doc; it states the facts itself. **When you retire a transient doc, delete its inbound links — never repoint them at the replacement.**
- **Do not cross-link docs for navigation.** Link only when a reader cannot act without the other file.

## Citing commits

The prohibition on topic-branch SHAs, and the check that enforces it, is an
always-on rule. This is what to write instead.

What a commit reference is usually standing in for is "this behaviour/file/rule
exists now". State that directly:

- **The symbol or file the commit introduced** — `private static let
  operationFields`, `CBDCHistoryLiveGateway.swift`. This survives any history
  rewrite *and* is checkable, which a SHA never was: a reader can grep it, and a
  verification script can assert it.
- **The branch name**, when you only need provenance for a rendered artifact
  ("rendered from these files on branch X"). A branch label is not a content
  identifier, so it does not pretend to pin a revision.
- **A trunk SHA**, once the work has landed — then it is stable and citable.

Prefer the symbol even when a trunk SHA is available: a SHA tells a reader where
to look in history, a symbol tells them what to look for in the code, and only
the second one can be mechanically re-verified later.

## Log entries

Keep entries concise, outcome-focused. Don't mirror git commits. List major
accomplishments in reverse chronological order (newest first). Focus on what was
achieved and why it matters, not how.

## Ownership

**Every change in a shared doc folder is your change**, whichever session made
it. Fix the defect; don't trace authorship.
