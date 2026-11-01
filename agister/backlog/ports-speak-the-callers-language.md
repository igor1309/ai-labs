---
date: 2026-10-14
model: claude-opus-5-5
description: "Backlog: a port speaks its part's language, not the wrapped library's, from the owner's finding on LAB-256"
---

# A port speaks its part's language

From the owner's finding on LAB-256. The archived reader's filesystem
seam copied `os` one to one, so its tests had to plant `os` errors and
the reader still made `os`'s decisions itself.

A port says what its part needs to know, in its part's words. For the
settings reader that is: what is at a path (nothing, a directory, a
regular file, something else, a link to nothing); the bytes of a regular
file; a directory's entries with their kinds; whether two paths are the
same directory. The wrapper translates `os` into those facts, and its
contract tests prove the translation (ADR-009, rule 3).

The review prompts already hold this ("a one-to-one copy translates
nothing"); the reader's ADR, when written, should give its port in these
terms.
