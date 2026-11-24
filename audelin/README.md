# Audelin

Landing page: index.html

A native macOS companion for the owner's calls (Zoom, Telemost, Meet) in
Russian with English professional terms. It records both sides as two
tracks, shows a smooth, selectable live transcript in a floating panel, and
can make notes of a call.

Status: the menu bar app records detected calls, shows the live transcript,
keeps a calls window of past calls with their notes, and opens native
Settings. Recording and recognition stay local. Call notes are optional and
off by default; Settings shows where a transcript would be sent and what it
costs. Credentials are read only for a request and never stored or shown.

CLI `audelin`, data folder `~/.audelin`, calls in `~/Recordings/Audelin`.

- Architecture rules: [ARCHITECTURE.md](ARCHITECTURE.md).
- Behaviour: the specs under `docs/spec/`, written as
  [docs/spec-process.md](docs/spec-process.md) says.
- Building, testing and profiling: [AGENTS.md](AGENTS.md).
- Changes: [docs/log.md](docs/log.md).

## Build and run

From `audelin/macos`: `sh scripts/bundle.sh`, then `open .build/Audelin.app`.
Logs: `log stream --predicate 'subsystem == "dev.igor1309.audelin"'`.

## Browser extension

`extension/` holds the Manifest V3 extension that names remote speakers in
Telemost calls, for Chrome and Yandex Browser. Its [README](extension/README.md)
gives the install steps; Audelin registers the extension's native helper at
each launch.

## Call feed

`feed/` holds two Go programs that let a thread follow a call as it is
recorded: `audelin-feed` serves the live transcript's words on loopback and
`audelin-follow` prints them for the thread. Its [README](feed/README.md)
says how to run them.

## Install and updates

- **First install:** `sh audelin/macos/scripts/install.sh` from the repository root
  builds the app, quits a running copy, replaces `/Applications/Audelin.app`, opens it
  and adds `~/Library/LaunchAgents/dev.igor1309.audelin.login.plist`, which opens it
  at login. Delete that file to stop starting at login. macOS asks for microphone and
  audio-capture access on first use; the first launch downloads and compiles the models.
- **Updates are automatic.** Each trunk merge that changes the app (`macos/App`,
  `macos/Sources`, the package manifests, `bundle.sh` or `install.sh`) runs the
  `Audelin Install` workflow on this Mac's self-hosted `local-mac` runner, which runs
  `install.sh --update`: it replaces the copy in `/Applications` and neither quits nor
  opens Audelin. A running Audelin notices within seconds and relaunches itself into the
  new build once it is idle: never during a recording, a folder move, a pending rename or
  delete, or a summary being written. A quit Audelin stays quit. To install trunk by hand, dispatch `Audelin Install` from GitHub Actions.
  A failed install is reported in the CI Telegram chat and leaves the installed copy
  as it was.
- **Public releases:** the `Audelin Release` workflow runs on the same runner every
  Monday at 04:00 UTC and on manual dispatch. `scripts/release.sh` builds the app
  signed with the Developer ID Application certificate, notarizes and staples it,
  and publishes the zip as a release of the public `igor1309/audelin` repository.
  It publishes nothing when the latest release was built from the same app source.
  It needs a notarytool profile in the login keychain, made once with
  `xcrun notarytool store-credentials audelin-notary`, and the `PUBLIC_REPO_PAT`
  secret with contents write on `igor1309/audelin`.
