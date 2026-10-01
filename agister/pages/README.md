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

Open `agister/pages/index.html` from disk in Chrome or Edge (drag it into
a window, or `open -a "Google Chrome" agister/pages/index.html`). Folder
access uses the File System Access API, which Safari and Firefox lack;
there the page renders but cannot open folders.

The page code is in `index.html`; the logic that does not touch the DOM is
in `repos.js` (the picker) and `config.js` (reading the settings; its YAML
and TOML parsers cover what Agister settings use). Both are classic scripts
rather than ES modules, because Chrome does not load module scripts from
`file://`.

## Data

Everything stays in the browser, per page origin:

- IndexedDB database `agister-pages`, store `repos`: the folder handles,
  keyed by folder name plus an id.
- localStorage key `agister-pages:recent`: the recent list (name, last
  opened), most recent first, at most 10.

The browser grants access only to the folder you choose and what is under
it; reopening a recent repo may ask for read access again.

## Test

From the repository root: `node --test agister/pages/tests/*.test.js`.
