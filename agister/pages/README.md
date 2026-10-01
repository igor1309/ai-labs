# Agister pages

`index.html` is a static page for Agister: no build step, no server. For
now it holds the page shell and a repo picker: choose a folder, browse its
subfolders, and keep a list of recent repos (folders with a `.agister`
directory at their root).

## Open it

Open `agister/pages/index.html` from disk in Chrome or Edge (drag it into
a window, or `open -a "Google Chrome" agister/pages/index.html`). Folder
access uses the File System Access API, which Safari and Firefox lack;
there the page renders but cannot open folders.

The page code is in `index.html`; the logic that does not touch the DOM is
in `repos.js`, a classic script rather than an ES module, because Chrome
does not load module scripts from `file://`.

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
