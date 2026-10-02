# Agister pages

`agister pages` serves a page that shows what Agister can run with a
repo's settings and what that is made of, and how its runs went. `~` in
the picker at the top right is Agister home, `~/.agister`; the picker also
opens repos and lists recent ones. **Settings** and **Runs** at the top
left switch between the two views; the page opens on the one shown last.

## Settings

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
    schema and verify attempts (of the verification it names, when it
    names one; marked missing when these settings have none of that name),
    and the prompts it names, each marked missing when these settings have
    none of that name;
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

## Runs

The runs are Agister home's, whatever the picker shows. ↻ reads them
again.

- **Compare**: a table per process, a row per runtime adapter, model and
  effort (`-` when the call asked for none): runs, completed, pass rate,
  mean verify attempts, median wall time and cost per completed run, with
  the count of runs of unknown cost when there are any. Workflows are not
  compared; their steps are.
- **Runs**, newest first: when it started, the process, the implementor
  (`adapter model effort`; the model the runtime reported shows on hover
  when it differs), status, verify (`2 ✓`: the attempts used and whether
  the last passed; empty without verify), wall time, cost, the skills used
  (`name×n`) and the tool calls. A workflow's row shows its node count and
  its judge's rulings instead of implementor and skills. Process and status
  filter the list. Runs whose record does not parse are counted under it.
- Clicking a run opens it below the list: implementor, policy, outcome
  (verify as `2/3 ✓`, out of the process's most), skills, the workflow it
  belongs to, and for a workflow its nodes and its judge's items by
  ruling, by severity and per source review. A link opens that run. The
  record as stored is folded at the bottom.

Durations read `1m 47s` or `412ms`, costs `$0.50`, times in local time. A
failed or interrupted run shows in red.

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

The server writes nothing and answers these endpoints:

- `POST /api/choose`: shows the folder dialog (`osascript`, `choose
  folder`) and returns the chosen path, empty when cancelled. It needs the
  `X-Agister-Pages` header, which a page on another site cannot send.
- `GET /api/settings?path=<absolute repo path | ~>`: the settings files of
  `<path>/.agister`, or of Agister home for `~`: `agents`, `policies`,
  `processes`, `runtimes`, `schemas`, `verifies`, `prompts`, `workflows`
  and `service.toml`, each at most 256 KB. `runs/` and `logs/` are skipped.
- `GET /api/runs?limit=<n>`: a summary of each run in Agister home's
  `runs/`, newest first, at most `limit` (default 200, at most 1000).
  A run whose `record.json` does not parse is left out and counted in
  `skipped`; `total` counts the ones that parse.
- `GET /api/runs/<run-id>`: one run's `summary` and its `record` as
  stored. An ID that is not a plain run directory name is refused (400);
  a run that is not there is a 404.
- `GET /api/runs/compare`: the completed and failed calls (not
  workflows), grouped by process, then by runtime adapter, model and
  effort. Each group has its runs, completed runs, pass rate (completed
  over runs), mean verify attempts among the runs with verify, median wall
  time, the total cost of the runs with a known cost (`cost_unknown` counts
  the others) and the cost per completed run.

A run summary holds, from the record:

- the run's ID, process, agent, created and finished time, and status:
  the result's; with none, `running` while the process running it holds
  its `owner.lock`, and `lost` once none does (ADR-001 rule 11). The run
  store `agister run` writes is what tells;
- `implementor`: the runtime adapter and version, the model (the one the
  call asked for, else the one the runtime reported), the reported model,
  and the effort the call asked for. Runs recorded before the agent profile
  was have no effort; the agent file is never read again for it;
- `policy`: the effective timeout, cost cap, access and scope;
- `outcome`: the verify attempts used and whether the last one passed
  (none when the process has no verify), wall, turn and runtime ms, and the
  cost in USD with its source;
- `parent`: the workflow run a node's run belongs to;
- `workflow`, for a workflow run: its nodes (name, process, run, status)
  and, when its output has judge `items`, their count by ruling and by
  severity, and per source review (`by_source`: `<review>` in the
  sources' `<review>#<finding>`, counting the nodes other than the join
  from 1) the items it contributed to, by ruling;

and, from `events.jsonl` (left out when it cannot be read):

- `skills`: each skill used and how often: a `Skill` tool call, or a tool
  call whose input reads a `SKILL.md` (the skill is its folder's name);
- `tool_calls`: the number of tool calls.

It listens on loopback only and refuses a request whose Host is not
`localhost` or a loopback address, so another site cannot read through it.

The page itself is `index.html`, embedded in the binary with `repos.js`
(the picker and the calls to the server), `config.js` (reading the
settings; its YAML and TOML parsers cover what Agister settings use),
`runs.js` (the Runs view's formatting, filters and compare tables) and
`page.js` (the page's views and controls, started over the browser's
document, fetch and storage, which its tests replace with fakes).
`serve.go` is the server; `runs.go` summarises the runs.

## Always running

`deploy/` holds a per-user LaunchAgent, `com.igormalyarov.agister-pages`,
that runs `~/.local/bin/agister pages --no-open` at login and restarts it
when it exits. Build Agister and copy it to `~/.local/bin/agister`, then,
from `agister/`:

- `deploy/install.sh` writes
  `~/Library/LaunchAgents/com.igormalyarov.agister-pages.plist`, with the
  PATH of the shell that runs it, and loads it; the page is at
  `http://127.0.0.1:7465/`. If loading fails, it puts back the plist that
  was there before, or removes its own. It refuses when `~/.local/bin/agister` is not
  an executable file or the job is already loaded.
- `deploy/uninstall.sh` stops the job and removes the plist; the logs and
  the binary stay.

The server logs to `~/Library/Logs/agister/pages.out.log` and
`pages.err.log`. After replacing `~/.local/bin/agister`, the running server
keeps the old binary until
`launchctl kickstart -k gui/$(id -u)/com.igormalyarov.agister-pages`.

## Data

The browser's localStorage keeps, for the page's address:

- `agister-pages:recent`: the recent repos (path, name, last opened), most
  recent first, at most 10.
- `agister-pages:current`: what was shown last (`~` or a repo path); the
  page opens on it.
- `agister-pages:view`: the view shown last, `settings` or `runs`; the
  page opens on it.

## Test

From `agister/`: `go test ./pages/` and `node --test pages/tests/*.test.js`;
`go test ./deploy/` runs the LaunchAgent scripts against a temporary HOME
and a fake `launchctl`.
