# Agonara Session

One student's exploratory reading session, shared by web and Telegram. The
normal `agonara-session` process composes both surfaces around one serialized
session service. Reading through either surface persists the same position and
survives restart. There is no Brain or write to Agonara's learning record;
paragraph explanations explicitly report unavailable.

## Boundaries

- `internal/flow` owns accepted-content contracts, pagination, navigation,
  sections, paragraph context and source revision references. Its session
  service owns the state, revision checks and storage port.
- `internal/web` owns URLs, token-cookie access, HTML, responsive outline and
  paragraph menus. `internal/telegram` owns allowlisting, callbacks, rich/plain
  rendering, polling offset and displayed-message bookkeeping. Both consume
  their own session contracts and models.
- `internal/composition` translates the boundaries and attaches infrastructure.
  `internal/sessionstore` owns file formats and legacy migration. `internal/agonara` reads the existing public API and
  caches successful reads for five minutes. `internal/store` atomically writes
  private JSON; `internal/ownerlock` prevents overlapping local owners.

The [reading behavior specification](docs/reading-session.md) describes state,
revision, migration and failure behavior. The existing [design](design/web-page-brief.md)
and UI assets remain in use.

## Configuration

Secrets remain in a mode-600 env file outside the repository. Both commands
accept `-env-file <path>`, `-check-config` (no services started) and
`-check-running` (local HTTP guard/owner probe, no Telegram request).

| Setting | Use |
| --- | --- |
| `AGONARA_BASE_URL`, `AGONARA_LOGIN`, `AGONARA_PASSWORD` | Student's existing public API access |
| `WEB_TOKEN` | Required token exchanged once for an HTTP-only cookie |
| `WEB_ADDR` | HTTP listen address, default `:8740` |
| `SESSION_PAGE_SIZE` | Positive character budget, default 1000 |
| `BOT_TOKEN`, `CHAT_ID` | Required by the combined runner; one allowed chat |
| `SESSION_SHARED_STATE_PATH` | Required new shared reading file |
| `TELEGRAM_STATE_PATH` | Required new transport-only file |
| `SESSION_STATE_PATH` | Optional legacy bot file, retained for rollback |
| `WEB_PLACE_PATH` | Optional legacy web place; defaults to `web-place.json` beside the legacy bot file |
| `WEB_SESSION_STATE_PATH` | Required for isolated `agonara-web`; must differ from shared, transport and legacy paths |

All state paths must be absolute and distinct. The shared file takes precedence;
without it, migration chooses the existing web place, then the bot session.
Corruption fails startup rather than silently losing the student's place. Neither
legacy file is changed. Telegram offset and message revision are copied into the
new transport file. Callback revisions are validated against the shared session,
so a web move invalidates old Telegram buttons.

URLs remain `/`, `/p/{program}` and `/m/{entity}?page=N`. Open
`http://<mac>.local:8740/?token=…` once. Paragraph actions carry a session revision; stale actions return 409.
Pagination keeps canonical URLs so refresh and browser history remain usable. A direct current-material link without a page
resumes that material. Browsing preserves the last reading bookmark for Continue
reading. A failed content read or save preserves the last committed state.

## Run and verify

From this directory:

```sh
go run ./cmd/agonara-session -env-file <path>
# Separate state and address are required when running standalone alongside it:
go run ./cmd/agonara-web -env-file <standalone-env-path>
```

Standalone web creates its own service, has no Telegram poller and never writes
normal shared state. Only the combined runner is installed for normal use.

```sh
test -z "$(gofmt -l .)" && go vet ./... && go test -race -count=1 -timeout 1m ./...
go build ./cmd/...
```

Tests use content/session/HTTP collaborators and isolated filesystem/process
adapters. They send no Telegram messages and use no production corpus or state.

## Local deployment handoff and rollback

The combined process uses `ai.labs.agonara-session`; it serves the existing web
address. The standalone web plist has automatic startup and keepalive disabled.
The handoff also disables the previously loaded standalone web job, so an old
installed plist cannot reintroduce two surface owners at login. A token-specific
kernel lock prevents two copies of the new poller; the old poller must be stopped
by the handoff before starting the new one.

After review, add the two new state settings to the existing env file, using new
filenames, and stage the binary at
`~/.local/share/agonara-session/bin/agonara-session.new`. Keep the installed legacy
binaries, plists, env file and state files. From this directory:

```sh
deploy/migrate.sh check
deploy/migrate.sh activate
# Restore the saved binary and whichever legacy jobs were previously loaded:
deploy/migrate.sh rollback
```

Activation validates first, saves the current runner, stops both old jobs,
disables standalone web, starts one combined runner and checks its local HTTP
identity and access guard. A failed activation restores the saved binary/jobs.
Rollback checks job availability and the restored web guard, independent of the
failed version. If `WEB_ADDR` uses another port, set
`AGONARA_SESSION_HEALTH_URL` for the rollback HTTP check. The rollback directory
is under the runtime home, and is replaced on each activation. Shared and
transport files remain available when rolling back; legacy services continue
from the untouched legacy files. Before migrating forward again after using the
legacy services, archive the new shared/transport files so migration can import
the newer legacy position and offset.

`AGONARA_SESSION_HOME`, `AGONARA_SESSION_LAUNCH_DIR`,
`AGONARA_SESSION_ENV_FILE` and `AGONARA_SESSION_LAUNCHCTL` override local deployment
locations and launchctl for an explicit environment or contract test.

`deploy/merge-hook.sh install` installs the local post-merge hook. Its `plan
<from> <to>` is read-only. Before the first explicit handoff it only tests and
stages the runner. Once activation has written the `single-owner` marker, future
trunk updates use the same handoff and rollback path. A failed check leaves the
running services untouched. No production activation is part of implementation.
