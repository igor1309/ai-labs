---
date: 2026-10-22
author: Igor Malyarov
model: claude-opus-5-5
---

# Showcase: public repos cut from the private monorepo

## The idea

ai-labs holds my AI-SDLC work, and some of its projects are worth showing on my public GitHub profile. The monorepo itself is private: its docs, research and notes hold my thoughts and discussions, and the history names issues, agents and tools that are mine alone.

So each project worth showing gets a small public repo: its code, its tests
and a README written for strangers, with pictures. Nothing else crosses over.
The first is rexlab (LAB-461), then foliotell (LAB-462); audelin follows
once it has something to show (LAB-463).

## Decisions

- **A fresh snapshot, no history.** A history split (`git subtree split`,
  `filter-repo`) would carry commit messages naming `LAB-*` issues, agister,
  Codex and the docs that were later moved. The public repo gets one commit
  per sync, `Sync from ai-labs@<sha>`.
- **An allowlist, not a denylist.** A new private file stays private unless
  someone adds it to the list.
- **Committed files only.** The export reads `HEAD`, never the working tree,
  so a stray local file cannot leak.
- **Code and tests public; docs private.** The one exception is rexlab's
  Gherkin, `docs/features/*.feature`: specs plus the tests that check them
  are the best evidence of how the work is done. Every other doc stays home.
- **A separate public README.** The project's own README stays written for
  me and the agents; the public one is written for a visitor.

## The process

Each public project has a `showcase/` folder:

```
<project>/showcase/
  showcase.toml    # private: public repo, metadata, allowlist, check
  screenshots.mjs  # private, optional: retakes the screenshots
  AGENTS.md        # private: the steps no script can do
  public/          # copied as-is to the public repo's root
    README.md
    LICENSE
    screenshots/
```

Only `public/` is public, with no exceptions to remember. `showcase.toml`
names the public repo, its description, homepage and topics, the `include`
and `exclude` globs of committed files, and the `check` command that must
pass inside the export.

One exporter serves every project, `scripts/showcase/export.js`:

1. Export the committed files at `HEAD` that the allowlist matches.
2. Lay `public/` over them.
3. Stop on a secret (`gitleaks`) or on a private marker from the shared
   `scripts/showcase/markers.txt` (`agister`, `multica`, home paths). Issue
   ids such as `LAB-461` are opaque and stay public.
4. Run the project's `check` inside the export, so the public repo builds
   and passes its tests on its own.
5. A plain run stops there, a dry run in a temp directory. `--push` commits
   to the public repo, pushes, and on every push applies the description, homepage and
   topics with `gh repo edit`.

What no script can do lives in the project's `showcase/AGENTS.md`: retaking
the screenshots, deciding when the README needs a rewrite, reading it for
private context, pinning the repo on the profile.
