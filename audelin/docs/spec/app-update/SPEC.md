# App update

Status: proposed (LAB-1059), for the owner's review before implementation.

Each trunk build is installed into `/Applications/Audelin.app` while the
running Audelin keeps going. AppUpdate notices that the installed build
differs from the running one, shows it in the menu bar, and restarts into it
when the owner asks and no call is on. The screens are Screen 7b in
`../../design/visual-language.pen`; the brief is
`../../design/app-update.md`.

## Build identity

- `bundle.sh` stamps `AudelinBuildID` into `Info.plist`: the short commit,
  `-dirty` when the tree has uncommitted changes, and the UTC build time,
  for example `6df7dd2d-20261108T063502Z`. `CFBundleVersion` becomes the
  same time as digits (`20261108063502`), so it rises with every build.
- The app reads its own id from its main bundle at launch. A build with no
  `AudelinBuildID` (an older bundle, or a test build) has the id `unknown`.
- **An update is available when the installed id differs from the running
  one.** Any difference counts, not only a newer time: what is installed
  is what a launch would open, so a reinstalled older build is offered too.
  When they are equal there is no update. This comparison is a pure
  function with its own tests.

## Noticing an install

- An FSEvents stream on `/Applications` with file-level events, filtered to
  paths under `Audelin.app`, wakes the machine. Nothing polls.
- A wake is not read at once. The effect handler waits until the bundle
  has been quiet for 2 s, then reads `Contents/Info.plist`. A bundle
  still being copied is not read: a missing or unreadable plist, a
  different `CFBundleIdentifier` or a missing `AudelinBuildID` leave the
  state as it was, and the next event reads it again.
- The installer (LAB-1057) copies the new bundle beside the old one and
  swaps it in with one rename, so a read sees either the old bundle or the
  new one whole. The quiet wait covers an installer that copies in place.
- At launch the handler reads the installed bundle once, so a build that
  was installed while Audelin was quitting is noticed too.
- The FSEvents stream callback runs on a dedicated serial queue and only
  sends an event. The plist read runs there too, and its result is awaited
  as an event.

## Machine

Async (`ObservableModel`): the reducer emits effects, the handler runs
them.

### State

| Field | Values | Meaning |
|---|---|---|
| `running` | build id | The running build, set at init. |
| `installed` | `none`, `available(id)` | Whether an installed build differs from the running one. |
| `call` | `idle`, `inCall`, `finishingSave` | Whether a call holds the restart back. |
| `restart` | `none`, `requested`, `quitting` | Restart progress. |
| `badge` | bool | The dot on the menu bar item. |
| `item` | `absent`, `active`, `disabled(reason)` | The "Перезапустить для обновления" menu item. |

`badge` and `item` are the rendered values, which the reducer sets on each
event. The reason text comes from a string passed to the reducer's init
(«Доступно после звонка»).

- `badge` is true exactly when `installed` is `available`.
- `item` is `absent` when `installed` is `none`. It is `disabled(reason)`
  when `call` is not `idle` or `restart` is not `none`, and `active`
  otherwise.

### Events and effects

| Event | When | Change | Effect |
|---|---|---|---|
| `started` | compose starts the machine | none | `watch` (start the stream and read once) |
| `bundleChanged` | the stream reports a change under `Audelin.app` | none | `read` (after the quiet wait) |
| `read(.build(id))` | the plist read cleanly | `installed` = `none` if `id == running`, else `available(id)` | none |
| `read(.unreadable)` | the bundle is missing or half-copied | none | none |
| `callChanged(gate)` | Recording's phase maps to a new gate | `call` = gate | none |
| `restartTapped` | the owner picks the item | `restart` = `requested` when available, call `idle` and restart `none`; otherwise no change | `relaunch` |
| `relaunchStarted` | the relauncher is running | `restart` = `quitting` | `terminate` |
| `relaunchFailed` | the relauncher could not start | `restart` = `none` | none |

Compose maps Recording's phase to the gate: `idle` → `idle`;
`beginning` and `recording` → `inCall`; `ending` → `finishingSave`, which
covers the final transcript being written.

### Cases written down

- **An install during a call.** The read sets `available`: the badge shows
  and the item is disabled with its reason. When `callChanged(idle)`
  arrives, the item becomes active and the badge stays.
- **A second install while one is pending.** The new read replaces the id
  in `available`; the badge and the item stay as they are. If the second
  install puts back the running build, `installed` becomes `none` and the
  badge and item go away.
- **An install during a restart.** While `restart` is `requested` or
  `quitting`, `bundleChanged` gives no effect and `read` changes nothing.
  The relauncher opens whatever is at `/Applications/Audelin.app` once
  this process has exited, which is the latest install.
- **A tap that races a call starting.** If `restartTapped` arrives while
  `call` is not `idle`, it is ignored. A call that starts after the restart
  was requested does not stop it. The app terminates through its normal
  quit path, which ends a recording the way «Выйти» does today; the window
  between the tap and the quit is a single process launch.
- **A relaunch that fails** (for example, the bundle was removed) puts the
  item back to active; the badge stays.

### Restart

`relaunch` starts a detached helper, `/bin/sh -c`, that waits for this
process's pid to exit, then runs `open /Applications/Audelin.app`. Then
`relaunchStarted` is sent. `terminate` calls `NSApplication.terminate`,
whose normal path saves state; pending note jobs resume on the next launch
as they do today. Waiting for the old process keeps two Audelins from
holding the microphone at once. The process launch runs on the handler's
serial queue and is awaited.

## Placement

- `AppUpdate` (in `macos/Sources`) holds the state, event, effect, the pure
  reducer, the effect handler with injected ports (watch, read, relaunch,
  terminate) and the build-id comparison. It imports no state machine.
- An adapter target holds the FSEvents watcher, the plist reader and the
  relauncher.
- The MenuBar UI renders `badge` and `item` and sends `restartTapped`.
  Compose builds the model, feeds it `callChanged` from Recording, and
  passes its state to the menu.

## Tests

- Reducer: each row of the table, from each `restart` and `call` value
  where it matters, including an install during a call, a second install
  while one is pending, an install back to the running build, an install
  during `requested` and `quitting`, and a tap while not idle. Each state
  test is paired with an effect test for the same state and event.
- Effect handler: with spies for the ports, `watch` starts the stream and
  delivers the first read; `read` delivers the reader's result after the
  quiet wait, measured on an injected clock; `relaunch` delivers
  `relaunchStarted` or `relaunchFailed`.
- Build identity: the comparison, and the plist read rejecting a missing
  file, another bundle identifier and a missing id, all in a temp
  directory.
