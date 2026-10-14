# agister pages as a LaunchAgent

The owner wants `agister pages` always running, like Verger: started at
login, restarted when it exits, without a terminal open. Add a per-user
LaunchAgent for it, with install and uninstall scripts. Follow Verger's
layout and plist (`~/Developer/my-apps/inventory/tools/verger/deploy/`:
`launchagent.plist.in`, `render.sh`, `install.sh`, `uninstall.sh`), but
stay small: no release staging, checksums, install records or upgrade
script. Agister is built and copied to `~/.local/bin/agister` by hand.

## What to add, under `agister/deploy/`

- `launchagent.plist.in`: label `com.igormalyarov.agister-pages`;
  ProgramArguments `@HOME@/.local/bin/agister pages --no-open` (no browser
  window at every login); RunAtLoad and KeepAlive true; EnvironmentVariables
  PATH only (`@PATH@`); StandardOutPath and StandardErrorPath
  `@HOME@/Library/Logs/agister/pages.out.log` and `pages.err.log`. The
  server stops within 2 s, so ExitTimeOut is not needed.
- `install.sh`: renders the template with HOME and the caller's PATH,
  XML-escaped (`&`, `<`, `>`), into
  `~/Library/LaunchAgents/com.igormalyarov.agister-pages.plist`; creates
  `~/Library/Logs/agister` (0700); then one
  `launchctl bootstrap gui/<uid> <plist>`. It refuses, changing nothing,
  when `~/.local/bin/agister` is not an executable file or the job is
  already loaded (`launchctl print gui/<uid>/<label>` succeeds). It must
  not run agister. Prints the page URL `http://127.0.0.1:7465/`.
- `uninstall.sh`: `launchctl bootout gui/<uid>/<label>` when loaded, then
  removes the plist. Leaves the logs and the binary. Running it when
  nothing is installed succeeds.
- Both scripts: POSIX `sh`, `set -u`, every path from `$HOME`, refusals
  exit 1 with one `install: …` / `uninstall: …` line on stderr.
- A short section in `pages/README.md`: install, uninstall, where the logs
  are, and that after replacing `~/.local/bin/agister` the running server
  keeps the old binary until `launchctl kickstart -k
  gui/$(id -u)/com.igormalyarov.agister-pages`.

## Tests

Go tests in `agister/deploy/` (a package holding only the test, e.g.
`deploy_test.go`) that run the scripts with `HOME` set to a `t.TempDir()`
and a `launchctl` shim first on PATH that records its arguments and answers
`print` as loaded only when a marker file exists. Cover: the rendered plist
(label, arguments, PATH and HOME escaped, log paths) parses with
`plutil -lint` when available and has those values; install bootstraps
once; install refuses with no binary and when already loaded, with no plist
written and no bootstrap; uninstall boots out and removes the plist;
uninstall with nothing installed succeeds. Each test within a few seconds.

Do not touch the real `~/Library/LaunchAgents` or the real launchctl. Run
the full check from `agister/` (its AGENTS.md). Report each command with
its exit code and final line, and list every file you changed.
