---
name: showcase-publish
description: Publish or update a project's public showcase repository (igor1309/<project>) from ai-labs, and feature it on the owner's GitHub profile. Use when publishing a project for the first time, re-syncing a public repo, retaking showcase screenshots, or editing the profile README. Triggers on "publish <project>", "showcase", "export.js --push", "public repo", "profile README", "pin the repo".
---

# Showcase publish

The exporter, its settings and the `showcase/` folder are described in
`research/showcase/README.md`; each project's own steps are in its
`showcase/AGENTS.md`. This skill holds what those do not: the order of a
first publication, the checks that caught real problems, and the profile.

## A first publication

1. Merge the project's `showcase/` settings, public README and screenshots
   through a PR. The owner approves the README text and every screenshot
   before it merges.
2. From a clean worktree of `origin/trunk`, run the dry export:
   `node scripts/showcase/export.js <project>`. It needs network, gitleaks
   and `gh`, so run it outside the sandbox. Inspect the temp directory it
   prints. If the project has a `compose.yaml`, run
   `docker compose up --build` there (start Docker with `orb start`) and
   `curl` each page the README promises.
3. Create the repository only after the owner has said, in their own words,
   to create it: `gh repo create igor1309/<project> --public --disable-wiki`.
   The exporter never creates repositories, and auto mode refuses a public
   repo without that explicit go-ahead; a bare "go" was not enough.
4. `node scripts/showcase/export.js <project> --push`. Every push also sets
   the description, homepage and topics from `showcase.toml`.
5. Clone the public repo fresh and repeat the run check from step 2.
6. `curl` the homepage URL itself. Agonara's domain root was a 404 while
   `/learn` served, so the homepage had to name `/learn`.
7. Record the repo URL on the project's issue. Pinning the repo on the
   profile is the owner's.

## The profile README

The profile lives in `igor1309/igor1309` on branch `trunk`. Images go in
`assets/<project>/`, never hotlinked. The owner approves new text and
diagrams before they are pushed.

- End each project's title line with `\`; without a hard break GitHub joins
  it to the description line.
- Draw Mermaid diagrams top-down. Left-to-right ones are clipped on a phone,
  behind GitHub's pan and zoom controls.
- Pick screenshots that stay under about 650 px tall at `width="600"`; a
  tall panel dominates the page.
- Check every change with headless Chromium at 1280 px and on the iPhone 13
  device profile, in both colour schemes. GitHub renders Mermaid late, in an
  iframe from `viewscreen.githubusercontent.com`: scroll the diagram into
  view, wait about 15 s, and screenshot the viewport. An element screenshot
  of a tall diagram comes out blank.

## Gotchas

- GitHub's `ubuntu-latest` is Ubuntu 26.04. Playwright installs Chromium
  there from 1.64 on; older versions fail the browser install step.
- The main checkout's `node_modules` can lag the lockfile, so its Playwright
  may not match the browsers in the cache. Run one-off Playwright scripts
  from a scratch directory with the version pinned.
- `$TMPDIR` differs inside and outside the sandbox; a file written by an
  unsandboxed command is not under the sandboxed `$TMPDIR`.
