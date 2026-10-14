---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-009: testing with spies: a part is tested over spies on its ports; real things only in a wrapper's contract tests; no test waits on real time"
---

# ADR-009: Testing with spies

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** how each part, wrapper and the composition is tested, and
  where real processes, git, files and time may appear
- **Decision type:** Architecture

## Context

The archived implementation's tests set up real repositories, built and
started real programs, and waited on real time for claims about settings,
workflows and wiring. They were slow, and their outcomes depended on how
busy the machine was. Its parts could not be tested apart: there was
little to put a spy on.

## Decision

Every part is tested over spies on the ports it declares. Real things
appear only in a wrapper's contract tests, whose claim is that real
thing. Nothing a test proves waits on real time.

## Rules

### 1. A part is tested over spies on its ports

A test of a part of `cli`, `settings/*` or `core/*` gives it spies for
the ports it declares and asserts what it asked of them and what it gave.
It starts no process, runs no `git`, touches no real file and reads no
real clock.

### 2. Real things belong to a wrapper's contract tests

A wrapper is tested against the real thing it wraps: a runtime wrapper
against its runtime's program or a stand-in of it, `git` against git,
`runstore` against files, the process supervisor against the operating
system. Such a test says which real thing its claim is about. No other
test uses one.

### 3. The composition is tested over spies on its wrappers

An adapter or decorator is tested over spies on the ports it joins or
wraps (ADR-001, implementation notes). The composition's wiring is
tested with spies in place of its wrappers. Few tests go through the
built binary, each for what only the binary shows.

### 4. Time is a port

Every wait, timeout and limit in the product reads a clock or a timer
the part declares, and a test drives it. No outcome depends on how fast
the machine is; a test that hangs is ended by the test run's timeout,
which names it.

### 5. What a test needs is a seam in the product

When a behaviour cannot be made to fail through the ports a part
declares, the part lacks a port; it gets one. A test adds no trick of its
own.

### 6. Tests run apart

A test shares no state with another, so tests run in parallel. A test
that must run alone says why.

## Consequences

- A part's tests are fast and say only what the part does.
- A change to a wrapper's real thing fails that wrapper's contract tests,
  and no other.
- The spies a part's tests need are the ports ADR-001 already gives it.
