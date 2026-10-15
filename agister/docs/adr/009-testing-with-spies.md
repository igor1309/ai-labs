---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-009: testing with spies: a part is tested over spies on its ports; real things only in a wrapper's contract tests; time and progress are ports"
---

# ADR-009: Testing with spies

- **Status:** Accepted
- **Topic:** Testing
- **Date:** 2026-10-14
- **Scope:** how each part, wrapper and the composition is tested, where
  real programs, git, files and time may appear, and what the product
  gives tests to drive it
- **Decision type:** Architecture
- **Amended by:** ADR-012 (2026-10-15)

## Context

A test that reaches real programs, git, files or the wall clock for a
claim about settings, workflows or wiring is slow, its outcome depends on
how busy the machine is, and its failure does not name the rule that
broke. A part whose collaborators are built in cannot be tested apart:
there is nothing to put a spy on, and its logic is proved only through
the real things under it.

## Decision

Every part is tested over spies on the ports it declares. Real things
appear only in a wrapper's contract tests, whose claim is that real
thing. Time and progress are ports too, so no test sleeps or polls.

## Rules

### 1. A part is tested over spies on its ports

A test of a part of `cli`, `settings/*` or `core/*` gives it a spy for
every port it declares and asserts what it asked of them and what it
gave. It starts no program, runs no `git`, touches no real file and
reads no real clock.

### 2. Collaborators are given, never defaulted

A part takes every collaborator it uses and falls back to none; a
missing one fails when the part is built. A spy fills in nothing its
test did not give. Only the composition names the real ones.

### 3. Real things belong to a wrapper's contract tests

A wrapper is tested against the real thing it wraps: `git` against git,
`runstore` against files, the supervisor against the operating
system. Such a test says which real thing its claim is about. No other
test uses a real thing. A runtime wrapper is tested over a spy of its
runtime's program; whether the real program still behaves so is the
version check of ADR-003, rule 8.

### 4. An integration test names what it integrates

Only what it names is real. An adapter or decorator is tested over spies
on the ports it joins or wraps (ADR-001, implementation notes): the
mapping both ways for an adapter, and for a decorator its concern and
that it passes everything else through unchanged. The
composition's tests integrate its parts with spies in place of its
wrappers. Few tests go through the built binary, each for what only the
binary shows.

### 5. Time and progress are ports

Every wait, timeout and limit reads a clock or timer the part is given,
and a test moves it. Work that goes on in the background says when it
has progressed or ended. No test outcome depends on how fast the machine is;
a test that hangs is ended by the test run's timeout, which names it.

### 6. A behaviour no test can fail lacks a port

When a behaviour cannot be made to fail through the ports a part
declares, the part gets the port it lacks. A fix is proved by a
committed test of that kind, never by a mutation or a hand check.

### 7. Each behaviour has one home

A case about a part's logic is that part's test; a case about a real
thing is its wrapper's contract test. The same case is not proved twice.

### 8. A check is kept; its cost is cut

The race detector and the test run's timeout stay. A slow test is made
cheaper, never given more time. Tests share no state, so they run in
parallel; a test that must run alone says why.

## Consequences

- A part's tests are fast, and a failure names the rule that broke.
- A change to git, files or the operating system fails its wrapper's
  contract tests, and no other; a runtime release is caught by its
  version, not by a test.
- The spies a part's tests need are the ports ADR-001 already gives it;
  a port a test needs and ADR-001 lacks is a change to the part.
