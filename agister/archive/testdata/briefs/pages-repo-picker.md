# Agister pages: a static page with a repo picker

Add `agister/pages/index.html`, a static page (no build step, no server)
that opens from disk in Chrome. This change adds only the page shell and
its first control, the repo picker.

## Look

Dark theme with the palette of the owner's accounts dashboard. Use these
CSS variables as written:

    --bg:#14161a; --card:#1c1f26; --line:#2b2f38; --fg:#e6e8ec;
    --fg2:#bec0c4; --fg3:#999ca1; --dim:#9aa1ad; --low:#3fb950;
    --mid:#d29922; --high:#f85149; --accent:#58a6ff; --active:#00e5ff

Body font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI",
Helvetica, Arial, sans-serif. Code: ui-monospace, SFMono-Regular, Menlo,
monospace. Cards: `--card` background, 1px `--line` border, 10px radius.
Focus: 2px `--accent` outline. Badges: 10px uppercase on `#2b2f38`.

## The picker (top trailing corner)

- A button in the top-right corner of the header shows the current
  location. With nothing chosen it reads `~` (home).
- Clicking it opens a dropdown that lists:
  1. **Recent repos**: repo roots opened before that have Agister
     installed, most recent first, at most 10, with a remove (×) control
     on each one.
  2. **Open folder…**: calls `window.showDirectoryPicker({ id: 'agister',
     startIn: 'documents' })`. The macOS dialog opens there; the owner can
     go to `~`.
- A folder is an **Agister repo** when it has a `.agister` directory at
  its root. When the chosen folder is one, add it to the recent list and
  show it as current.
- **Browsing:** below the header, a card lists the subfolders of the
  current folder (directories first, by name; hide dotfiles except
  `.agister`). Clicking a subfolder goes into it. A breadcrumb leads back
  up to the chosen root, no further, because the browser grants nothing
  above it. Mark a subfolder with an `agister` badge when it has
  `.agister`. Clicking such a badge makes that subfolder the current repo
  and adds it to the recent list.
- **Persistence:** a directory handle cannot go in localStorage. Keep the
  handles in IndexedDB (database `agister-pages`, store `repos`) keyed by
  name plus an id. Keep the light metadata (name, last opened) in
  localStorage under `agister-pages:recent`. On load, re-open a recent
  repo with `handle.queryPermission` / `requestPermission({mode:'read'})`
  on click. Permission may need a user gesture; if it is denied, say so
  inline and do not remove the entry.
- **No File System Access API** (Safari or Firefox, or `file://` without
  support): the picker still renders, and "Open folder…" is disabled with
  a one-line note: "Folder access needs Chrome or Edge."

## Structure and tests

- Keep the logic that does not touch the DOM in an ES module,
  `agister/pages/repos.js`, loaded by the page with `<script
  type="module">`. It holds: the recent list (add, move to front, dedupe,
  cap 10, remove, read and write through an injected `Storage`-like
  object); Agister detection and subfolder listing over an injected
  directory handle (anything with `entries()` / `getDirectoryHandle()`);
  and the sort and dotfile rules.
- Tests: `agister/pages/tests/repos.test.js`, run with `node --test`. Use
  fake handles and a fake storage built in the test, with no DOM and no
  real filesystem. Cover: detection with and without `.agister`, a
  `.agister` *file* that is not a directory, the listing order and
  dotfile filter, the recent list's order, dedupe, cap and remove, and
  corrupt JSON in storage (read as empty, no throw).
- CI: in `.github/workflows/ci.yml`, add `agister/pages/**` to the
  `agister` path filter. In `.github/workflows/agister-core.yml`, add a
  step `node --test pages/tests/*.test.js` (the job's working directory is
  `agister`), with `actions/setup-node` if the runner needs it. Follow
  how the other workflows set up Node.
- Add a short `agister/pages/README.md`: what the page is, how to open it,
  that it needs Chrome or Edge, and where its data is kept.

Do not change any Go code. Run `node --test agister/pages/tests/*.test.js`
from the repository root and report its exit code and final line. List
every file you changed.
