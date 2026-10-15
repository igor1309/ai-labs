---
date: 2026-10-15
model: claude-opus-5-5
description: "Research: plain lessons from build tools and CI for Agister's settings language: simpler, more familiar, less to write"
---

# Borrowed from build systems

Agister is a build system for agent work: named targets, steps,
dependencies, records. Make, just, Maven, Docker Compose and GitHub
Actions have taught millions of people the same few habits. This note
collects the ones that make Agister simpler, not bigger.

## Write less

1. **The path is the name (Maven, Compose).** A file's kind and name come
   from where it sits. `name: code_review` and `type: workflow` repeat
   `workflows/code_review.yaml`; drop them.
2. **One format (most tools).** Agents and `service.toml` are TOML;
   everything else is YAML. Two formats to learn, two parsers. Pick one.
3. **Inline first, extract when reused (GitHub Actions, Compose).** A
   step defined in place; a named file only when shared.
   `adr_review_codex.yaml` exists to set one prompt; that could be one line
   at its use.
4. **Defaults for the common case (Make, Maven).** A workflow run with no
   agent named uses a default agent; a bash step accepts on exit code 0
   unless it says otherwise.

## Familiar words

5. **inputs, steps, outputs (GitHub Actions, Nextflow).** Words people
   already know. `fan_out`, `join` and `node` are Agister's own; a reader
   has to learn them first.
6. **`needs` instead of operators (GitHub Actions jobs, Make).** Steps
   name what they wait for; what waits on nothing runs in parallel. One
   idea covers sequence, parallel and join.
7. **`if` on a step (GitHub Actions).** A branch is a step with a
   condition; a skipped step is reported as skipped. No separate branch
   construct to read.
8. **A step's output by path (GitHub Actions).** `steps.judge.outputs.verdict`
   reads the same everywhere: in a binding, a condition, a record.

## Fewer surprises

9. **No string templating (GitHub Actions injection advisories).**
   `rev: "${param.base}"` splices text. With a bash runtime that is
   injection. A value is a reference, `{from: params.base}`, and reaches a
   script by environment.
10. **One level of `extends` (Compose).** Values inherited through
    several layers are hard to trace. A document extends at most one
    other, and that one extends nothing.
11. **Quote-safe YAML (the "Norway problem").** `no`, `on`, `1.10` are
    not the strings they look like. Agister's parser reads YAML 1.2 or
    refuses ambiguous scalars.
12. **No anchors or includes (critiques of YAML anchors).** Reuse only
    by named documents, so one definition lives in one place.

## Running

13. **List what can run (`just --list`, `make help`).** Every workflow
    has a one-line description; `agister list` shows names and
    descriptions.
14. **Dry run (`make -n`).** Show the steps, their agents and bindings,
    and what would run, without running it.
15. **Errors point at the line (actionlint, compilers).** A refusal
    names the file, line and field, not only the chain.
16. **Editor checking for free (JSON Schema, SchemaStore).** Publish a
    schema per kind; editors validate and complete settings before
    Agister reads them.

## Not borrowed

- Caching and incremental rebuilds: agent output is not deterministic.
- Hermetic sandboxes: Agister works in the caller's worktree.
- A general-purpose language for settings (Gradle, Starlark): plain data
  plus a small condition set is enough.

## Sources

- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
- [GitHub Actions: security hardening, script injection](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
- [just manual](https://just.systems/man/en/)
- [GNU Make manual](https://www.gnu.org/software/make/manual/make.html)
- [Maven standard directory layout](https://maven.apache.org/guides/introduction/introduction-to-the-standard-directory-layout.html)
- [Docker Compose: extends](https://docs.docker.com/compose/how-tos/multiple-compose-files/extends/)
- [Nextflow workflows](https://nextflow.io/docs/edge/workflow.html)
- [The Norway problem (StrictYAML)](https://hitchdev.com/strictyaml/why/implicit-typing-removed/)
- [Dear GitHub: no YAML anchors](https://blog.yossarian.net/2025/09/22/dear-github-no-yaml-anchors)
- [actionlint](https://github.com/rhysd/actionlint)
- [SchemaStore](https://www.schemastore.org/)
- [Build Systems à la Carte](https://microsoft.com/en-us/research/uploads/prod/2020/04/build-systems-jfp.pdf)
