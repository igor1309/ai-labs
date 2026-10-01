# Agister pages

`agister pages` serves a page that shows what Agister can run with a
repo's settings and what that is made of. `~` in the picker at the top
right is Agister home, `~/.agister`; the picker also opens repos and lists
recent ones.

For a repo the page shows what Agister uses there: Agister home's settings
with the repo's `.agister` over them. As in Agister, a repo file replaces
the home file of the same kind and name, and the repo's `service.toml`
replaces home's. Each item is marked `repo`, `home` or `repo, replaces
home`.

- **Workflows** and **Processes**, as cards: what each does (its leading
  comment), the `agister run` command with its required params (Copy puts
  it on the clipboard), the defaults, and then:
  - for a process, its agent (runtime, model, effort, session), its policy
    (workspace, timeout, cost cap, what it allows and denies) and its output
    schema and verify attempts;
  - for a workflow, its calls in one line (`4 × gpt-6.1-sol at once, then
    opus`), then the steps: the ones run at once (`First` when there is
    one) and the one run after them. Each step shows its name, what it
    does, its agent and its policy. Steps are not repeated under
    Processes; they still run alone.
- **Building blocks**, as tables: agents, policies, runtimes and the service
  limits, each with what it means.

A workspace that can be written shows in amber; read-only is not marked. On
a narrow screen the cards go to one column and each table row becomes label
and value lines.

A name the settings do not define shows in red as missing: Agister refuses
such a call. A file that does not parse shows its error. ↻ reads the
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
