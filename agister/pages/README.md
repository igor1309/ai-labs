# Agister pages

`index.html` is a static page for Agister: no build step, no server. A
repo picker chooses a folder, browses its subfolders and keeps a list of
recent repos (folders with a `.agister` directory at their root).

When the current folder is a repo, the page shows its `.agister` settings
in a few lines each, not the whole files:

- **Workflows**: the purpose (the first sentence of the file's leading
  comment), the flow from fan-out processes to the join, and the parameters.
- **Processes**: the purpose, agent, policy, output schema, parameters
  (bold when required), verify attempts and the workflows that use it; the
  instruction stays folded.
- **Agents**: runtime, model, effort, session and the processes that use it.
- **Policies**: access, timeout, cost limit and the processes that use it;
  the permission lists stay folded.
- A line of service limits on top, and runtimes and schemas at the bottom.

Names link to their items. A name defined outside the repo (in Agister's
home or built in, such as the `claude-code` runtime) is marked in amber; a
file that does not parse shows as unreadable, with its error.

## Open it

Open `agister/pages/index.html` from disk in Safari, Chrome or any current
browser (`open agister/pages/index.html`). "Open folder…" uses the
browser's folder upload (`<input type="file" webkitdirectory>`): pick the
repo folder itself, since the browser reads every file under the folder
you pick, so a large folder such as `~` takes long. The page only reads;
nothing leaves the browser.

The page code is in `index.html`; the logic that does not touch the DOM is
in `repos.js` (the picker) and `config.js` (reading the settings; its YAML
and TOML parsers cover what Agister settings use). Both are classic scripts
rather than ES modules, because browsers block module scripts from
`file://`.

## Data

Everything stays in the browser's localStorage, per page origin:

- `agister-pages:recent`: the recent repos (name, last opened), most recent
  first, at most 10. A repo is known by its folder name.
- `agister-pages:settings:<name>`: a saved copy of each recent repo's
  `.agister` files (each at most 256 KB). The browser cannot reopen a
  folder by itself, so a recent repo shows this copy, with the time it was
  saved, until you open its folder again.

## Test

From the repository root: `node --test agister/pages/tests/*.test.js`.
