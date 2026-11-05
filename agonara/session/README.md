# Agonara Session

A Session runner for Agonara: one student's session, reached through a control
plane (today Telegram) and kept apart from the student's learning record.

Status: reads the programs the student can see, navigation and entities from
Agonara's public API. Still no brain and no writes to Agonara. It runs on the
owner's Mac under launchd.

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
 │    └─ node src/main.js   --env-file ~/.config/agonara-session/...    │
 │                                                                      │
 │   ┌───────────────┐  update   ┌──────────────┐  action  ┌─────────┐  │
 │   │ main.js       │ ────────> │ bot.js       │ ───────> │ session │  │
 │   │ long polling  │           │ allowlist    │ <─────── │ flow    │  │
 │   │ offset, state │           │ by chat ID   │ content  └─────────┘  │
 │   └──────┬────────┘           └──────┬───────┘ + actions             │
 │          │                           │ telegram-adapter.js:          │
 │          │ state file (mode 600)     │ buttons, 4096-char split      │
 └──────────┼───────────────────────────┼───────────────────────────────┘
            │ getUpdates                │ sendMessage
            ▼                           ▼
     ┌───────────────────────────────────────────┐
     │ Telegram Bot API                          │ <── the student's DM
     └───────────────────────────────────────────┘

   session ── agonara-client.js (session cookie, as the student) ──> https://agonara.enoa.ai
```

## The bot

- **Long polling,** so it needs no public URL. Only one poller may run per
  bot token: two take each other's updates and log `POLL CONFLICT`.
- **One chat:** it answers only `CHAT_ID`, by chat, not sender, so a group the
  owner is in is ignored too.
- **Buttons** carry the step they were drawn for; a press on an older message
  is refused instead of acting on a newer state. Long content is split at
  Telegram's 4096-character limit.
- **Browsing:** Programs → topics, ungrouped concepts and materials → an entity's
  title, body and outgoing items. Back retraces the screens; Programs returns
  to the list. Buttons carry item indices; IDs stay in the saved screen state.
- **Agonara errors** produce a short reply and a log line, keeping the previous
  session so the student can retry. An expired login is renewed once per request.
- **State** (Telegram offset and the session) is saved after every update, so
  a restart resumes where it stopped.

## Running it on the Mac

Secrets live outside the repo in `~/.config/agonara-session/probe.env`
(mode 600): `BOT_TOKEN`, `CHAT_ID`, `SESSION_STATE_PATH`,
`AGONARA_BASE_URL`, `AGONARA_LOGIN`, `AGONARA_PASSWORD` for the
non-admin identity `session-probe`.

launchd runs it from the main checkout. Install, stopping any other copy first
so two pollers never overlap:

    cp launchd/ai.labs.agonara-session.plist ~/Library/LaunchAgents/
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.labs.agonara-session.plist
    tail ~/Library/Logs/agonara-session.log

After a code change: `launchctl kickstart -k gui/$(id -u)/ai.labs.agonara-session`.
Remove: `launchctl bootout gui/$(id -u)/ai.labs.agonara-session`.

The Mac runs it only while awake. A VPS host waits until the bot must stay up
without it.

By hand, for a quick run: `node --env-file=<path> src/main.js`. Tests:
`npm test`.
