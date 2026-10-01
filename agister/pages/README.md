# Agister pages

`index.html` is a static page for Agister: no build step, no server. It
shows Agister settings as tables, one row per item. `~` in the picker at
the top right is Agister home, `~/.agister`; the picker also opens repos
and lists recent ones, each showing its `.agister`:

- **Workflows**: the processes run together, the one that then collects
  their results, and the parameters.
- **Processes**: agent, policy, output schema, verify attempts, parameters
  (required ones marked) and the workflows that use it.
- **Agents**: runtime, model, effort, session and the processes that use it.
- **Policies**: workspace access, timeout, cost cap, how many permissions it
  allows and denies (the lists show on hover) and the processes that use it.
- **Runtimes** and **Output schemas** defined in the repo, with their users.
- **Service limits** from `service.toml`, each with what it caps.

A file's purpose, its leading comment, shows on hover over its name. Names
link to their rows. A name not defined in the repo's `.agister` (Agister's
home or built in, such as the `claude-code` runtime) is marked ↗ in amber;
a file that does not parse shows its error in its row. ↻ re-reads the repo:
the browser asks for the folder again.

## Open it

Open `agister/pages/index.html` from disk in Safari, Chrome or any current
browser (`open agister/pages/index.html`). "Open folder…" uses the
browser's folder upload (`<input type="file" webkitdirectory>`): pick a
repo folder, or `~/.agister` itself for Agister home (⌘⇧. shows hidden
folders in the macOS dialog). Only the settings are read: `agents`,
`policies`, `processes`, `runtimes`, `schemas`, `workflows` and
`service.toml`; `runs/` and `logs/` are skipped. Nothing leaves the
browser.

The page code is in `index.html`; the logic that does not touch the DOM is
in `repos.js` (the picker) and `config.js` (reading the settings; its YAML
and TOML parsers cover what Agister settings use). Both are classic scripts
rather than ES modules, because browsers block module scripts from
`file://`.

## Data

Everything stays in the browser's localStorage, per page origin:

- `agister-pages:recent`: the recent repos (name, last opened), most recent
  first, at most 10. A repo is known by its folder name.
- `agister-pages:current`: what was shown last (`~` or a repo name); the
  page opens on it.
- `agister-pages:settings:<name>`: a saved copy of home's (`~`) and each recent repo's
  `.agister` files (each at most 256 KB). The browser cannot reopen a
  folder by itself, so a recent repo shows this copy, with the time it was
  saved, until you open its folder again.

## Test

From the repository root: `node --test agister/pages/tests/*.test.js`.
