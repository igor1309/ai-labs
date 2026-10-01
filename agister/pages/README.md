# Agister pages

`agister pages` serves a page that shows Agister settings as tables, one
row per item. `~` in the picker at the top right is Agister home,
`~/.agister`; the picker also opens repos and lists recent ones, each
showing its `.agister`:

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
a file that does not parse shows its error in its row. ↻ reads the
settings again.

## Run it

`agister pages` listens on `127.0.0.1:7465`, prints the address and opens it
in the default browser; Ctrl-C stops it. `--addr` takes another loopback
address, `--home` another Agister home (default `$AGISTER_HOME`, else
`~/.agister`), `--no-open` leaves the browser alone.

The picker lists `~`, the repos opened before (× removes one) and "Add
folder…", which shows the Mac's own folder dialog. Opening a folder asks
the server for that folder's `.agister` only: when it is there, the page
shows it and puts the repo on the recent list; when not, the page says so
and the list stays as it was.

The server writes nothing and answers two endpoints:

- `POST /api/choose`: shows the folder dialog (`osascript`, `choose
  folder`) and returns the chosen path, empty when cancelled. It needs the
  `X-Agister-Pages` header, which a page on another site cannot send.
- `GET /api/settings?path=<absolute repo path | ~>`: the settings files of
  `<path>/.agister`, or of Agister home for `~`: `agents`, `policies`,
  `processes`, `runtimes`, `schemas`, `workflows` and `service.toml`, each
  at most 256 KB. `runs/` and `logs/` are skipped.

It listens on loopback only and refuses a request whose Host is not
`localhost` or a loopback address, so another site cannot read through it.

The page itself is `index.html`, embedded in the binary with `repos.js`
(the picker and the calls to the server) and `config.js` (reading the
settings; its YAML and TOML parsers cover what Agister settings use).
`serve.go` is the server.

## Data

The browser's localStorage keeps, for the page's address:

- `agister-pages:recent`: the recent repos (path, name, last opened), most
  recent first, at most 10.
- `agister-pages:current`: what was shown last (`~` or a repo path); the
  page opens on it.

## Test

From `agister/`: `go test ./pages/` and `node --test pages/tests/*.test.js`.
