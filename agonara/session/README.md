# Agonara Session

A Session runner for Agonara: one student's session, reached through a control
plane (today Telegram) and kept apart from the student's learning record.

Status: reads the programs the student can see, navigation and entities from
Agonara's public API. Still no brain and no writes to Agonara. It is one Go
module with no dependencies, and runs on the owner's Mac under launchd.

## The idea

A session is everything a student does while learning: explanations, deeper
dives, practice, stopping to ask why. It belongs to the student, not to any
surface, so the same session can continue from Telegram, the web or an agent.
Each step returns content plus the actions now available, named by meaning
("explain simpler", "dive deeper"); each surface decides how to draw them.

The session holds no learning truth. Only an answer to an accepted check, and
reads of the student's state, go to Agonara, through its public API as the
student.

```text
 ┌──────────────────────────── owner's Mac ─────────────────────────────┐
 │                                                                      │
 │  launchd: ai.labs.agonara-session   (start at login, restart on exit)│
 │    └─ bin/agonara-session -env-file ~/.config/agonara-session/...    │
 │                                                                      │
 │   ┌───────────────┐  update   ┌──────────────┐  action  ┌─────────┐  │
 │   │ cmd/agonara-  │ ────────> │ telegram     │ ───────> │ flow    │  │
 │   │ session: poll │           │ allowlist    │ <─────── │ session │  │
 │   │ offset, state │           │ by chat ID   │ content  └─────────┘  │
 │   └──────┬────────┘           └──────┬───────┘ + actions             │
 │          │                           │ telegram render:              │
 │          │ state file (mode 600)     │ rich message, plain fallback  │
 └──────────┼───────────────────────────┼───────────────────────────────┘
            │ getUpdates                │ sendRichMessage
            ▼                           ▼
     ┌───────────────────────────────────────────┐
     │ Telegram Bot API                          │ <── the student's DM
     └───────────────────────────────────────────┘

   flow ── agonara client (session cookie, as the student) ──> https://agonara.enoa.ai
```

## The code

- `internal/flow`: the session. Given the saved place and an action it returns
  the screen as meaning (title, text, lists, position, actions by kind). It
  knows nothing of Telegram, so another surface, such as a web page, can draw
  the same screens.
- `internal/telegram`: draws a screen as a rich message or the plain
  fallback, and handles updates.
- `internal/agonara`: the public API as the student. `internal/store`: the
  state file. `cmd/agonara-session`: the composition root and polling loop.

## The bot

- **Long polling,** so it needs no public URL. Only one poller may run per
  bot token: two take each other's updates and log `POLL CONFLICT`.
- **One chat:** it answers only `CHAT_ID`, by chat, not sender, so a group the
  owner is in is ignored too.
- **Buttons** carry the step they were drawn for; a press on an older message
  is refused instead of acting on a newer state.
- **Browsing:** Programs → a program's topics, concepts and materials → an
  entity's title, body and linked items. Back retraces the screens; Programs
  returns to the list. Buttons carry item indices; IDs stay in the saved state.
- **One rich message per screen** (Telegram Bot API 10.1): the names of
  programs, topics, concepts and materials are tappable where they are
  written, materials first and marked 📖. Back and Programs, and Prev and Next,
  are button rows at the end of the message. A press redraws the same message
  instead of adding one.
- **Reading:** a lecture comes a phone screen at a time (about 1,000
  characters, `SESSION_PAGE_SIZE` to tune), cut at paragraphs and never across
  a section, with its front matter left out. A page that fits the screen is
  flipped in place by Next, so nothing scrolls and the reader keeps their
  place; a taller page left Telegram showing its end. Each page starts with
  where it is (*§2 Section · 3/6*) and ends with Prev, Next and Contents. The
  contents page lists the intro and each section to tap, and the lecture's
  linked items.
- **Plain fallback:** if Telegram refuses a rich message, the screen goes out
  as before, as HTML text with number keys five to a row and a "📖 Read" button
  per material, split at 4,096 characters, and the refusal is logged. Markup
  Telegram refuses there is sent again as plain text.
- **Agonara errors** produce a short reply and a log line, keeping the previous
  session so the student can retry. An expired login is renewed once per request.
- **State** (Telegram offset and the session) is saved after every update, so
  a restart resumes where it stopped.

## Running it on the Mac

Secrets live outside the repo in `~/.config/agonara-session/probe.env`
(mode 600): `BOT_TOKEN`, `CHAT_ID`, `SESSION_STATE_PATH`,
`AGONARA_BASE_URL`, `AGONARA_LOGIN`, `AGONARA_PASSWORD` for the
non-admin identity `session-probe`.

launchd runs the binary built in the main checkout (`bin/` is not
committed). Build it, then install, stopping any other copy first so two
pollers never overlap:

    go build -o bin/agonara-session ./cmd/agonara-session
    cp launchd/ai.labs.agonara-session.plist ~/Library/LaunchAgents/
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.labs.agonara-session.plist
    tail ~/Library/Logs/agonara-session.log

After a code change, build again, then
`launchctl kickstart -k gui/$(id -u)/ai.labs.agonara-session`.
Remove: `launchctl bootout gui/$(id -u)/ai.labs.agonara-session`.

The Mac runs it only while awake. A VPS host waits until the bot must stay up
without it.

By hand, for a quick run: `go run ./cmd/agonara-session -env-file <path>`.
Tests: `go test -race ./...`.
