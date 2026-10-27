---
date: 2026-10-23
model: claude-opus-5-5
description: "Audelin's main shape: state machines split into reducer and effect handler, fed by merged event streams."
status: accepted (owner, 2026-10-23)
---

# App shape

How Audelin's behaviour around a call is organised: what starts and stops a
recording, what the panel shows, what happens to a call's folder. It closes
the v1 gaps filed under LAB-400 (LAB-506 to LAB-510, with LAB-426, LAB-407,
LAB-406). The components it names follow `../ARCHITECTURE.md`; what each
one does is specified later, one `SPEC.md` each (`spec-process.md`).

## The pattern

The app's own decisions (what to record, what the panel shows, what
happens to calls and settings) are state machines made of separate parts,
borrowed from the owner's `RxViewModel` (swift-vortex, iFora), without
Combine. Components that already have a responsibility of their own (live
text, call text, the recognizers, the process and capture components) keep
it and their own ports; the machines use them as dependencies.

| Part | What it is | How it is tested |
|---|---|---|
| Reducer | A pure function: `(State, Event) -> (State, Effect?)` | Tables of event in, state and effect out |
| Effect handler | A dispatcher: reads the effect and hands it to the one dependency it was given for it, then turns the result into an event. It has no logic of its own | Fakes behind its dependencies |
| Model | The generic loop: takes events one at a time, reduces, publishes the state, hands the effect to the handler, and feeds the handler's events back in | Once, generically |
| Compose | Builds one machine: its reducer, handler and model, and subscribes its input stream to the model | Nothing to test: no decisions |

The model is one generic actor over `AsyncStream`, written once and reused
by every machine. A reducer never does I/O. A handler never decides: when a
choice depends on state, the reducer makes it and names it in the effect.
A sequence is the reducer's too: each step is one effect, and its result
comes back as the event that leads to the next step.

## Event sources merge in a mapping

A machine with several sources gets them through a merge: a thin, pure
mapping that takes each source's stream and delivers one stream of the
machine's own events. It translates the sources' types into the machine's
(`ARCHITECTURE.md` rule 3) and is tested as a mapping. Compose applies it.
No source knows the machine, and no machine knows a source.

## The machines

### Recording

Decides whether a recording runs and why.

- **Events, from merged sources:** a call starting and ending (from Core
  Audio processes); the user's start and stop (from the panel and menu
  bar); automatic recording on or off (from Settings); conditions (access,
  the calls folder), each from an adapter's stream of its lifecycle; the
  state of the running Session.
- **Effects:** begin a Session, end it. Compose carries both out.

User scenarios: S-1, S-2, S-7, S-17, setup and the launch blocker.
Closes LAB-506, LAB-426.

### Session

Brings one recording's pieces up and down and says how each is doing. A
Session lives for one recording, like Reading.

- **Events:** end (from Recording, through compose); each side's access;
  the live text switch
  (the panel's, and the Settings preference); the results of its own
  effects, including a piece failing.
- **Effects:** each step of bringing the pieces up and down: create the
  call's folder, pick the call app's processes, start or stop the captures,
  open or close the track files, start or stop call text, open or close
  the transcript file; switch live text. The reducer orders the steps.
- **Handler:** dispatches each effect to the dependency given for it. It
  owns none of their behaviour.

User scenarios: S-8, S-9, S-15, S-16, and the keeping in S-7 and S-17.
Closes LAB-510.

### Reading

Decides what the panel shows.

- **Events:** call text's updates; the panel's hold, let go, scroll and
  jump to live; the recording's state.
- **Effects:** none. Compose creates a Reading with each Session, feeds its
  call text updates and elapsed time once a second until the Session ends,
  and exposes translated panel states and reading actions through
  `AudelinPanel`. Preparing carries held selections, so they remain visible
  while live text gets ready again.

User scenarios: S-3, S-4, S-5, S-11 to S-14. Closes LAB-507.

### Settings

Decides the user's preferences: the recognition engine and its chunk,
automatic recording, live text on or off, the calls folder's location.

- **Events:** the choices from the settings screen and the menu bar; the
  results of its effects.
- **Effects:** store a preference; ask Recordings to move the calls folder.
- Its state feeds Recording (automatic recording), the running Session
  (live text) and call text's recognizer choice, through compose. The
  panel's switch acts on that Session only.

### Recordings

Decides what happens to recorded calls and the calls folder.

- **Events:** rename, delete, move the calls folder; whether a recording
  runs; its handler's results.
- **Effects:** rename or delete a call's folder, move the calls folder.
- Listing is a plain read through the folder adapter, not a machine.

User scenario: S-10. Closes LAB-407.

## Views of state

The panel, the menu bar item (LAB-509), the settings screen, setup and the
launch blocker (LAB-406) and the error screens (LAB-510) draw a machine's
state and send its user events. They decide nothing. Setup and the launch
blocker draw the conditions as their merge mapping combines them;
readiness is no machine of its own.

## Data flow

Compose connects one recording's pieces when they are built, translating
types between them:

- Each capture writes its track file, and feeds call text's live audio.
- Each track file is read back as call text's written track.
- Call text's updates feed that recording's Reading and its transcript file.

Session only starts and stops these pieces; audio and text never pass
through a machine.

## Components already built

| Component | Role in this shape |
|---|---|
| Core Audio processes | Source of call start and end for Recording |
| Call app processes | Dependency of Session's handler: which processes to capture |
| System audio capture | Dependency of Session's handler: the call's track |
| Call text | Dependency of Session's handler; its updates feed Reading |
| Side text | Inside call text, one per side: that side's text to its end |
| Fill in | Inside side text: gets live text ready and reads it what it missed |
| Transcript writing | Around call text, a decorator at the root: keeps its text in the transcript file |
| Live text, the recognizers, model loading | Inside call text, behind its ports; model loading also feeds the conditions | The UI targets (`PanelUI`,
`SettingsUI`, a menu bar target) stay renderers.

## Adapters still needed

- Microphone capture: built only in the live text preview.
- Track file: a track's audio on disk.
- Transcript file: the transcript on disk (LAB-508).
- Folder: a call's folder and the calls folder on disk.
- Conditions: models, access and the calls folder, each a stream of its
  lifecycle.
- Preferences: the settings on disk.

## Change to ARCHITECTURE.md

Rule 4 said "coordination is wiring, not a shared component". It now says
that coordination that decides anything is a machine with tests, and that
compose only builds and subscribes.

## Decided

Each line can be overturned by the owner.

- **Machines talk only through compose.** Compose subscribes one machine's
  state stream to another's events, as Reading receives its Session's state,
  and translates between their types (`ARCHITECTURE.md` rule 3). There are
  no shared streams between machines.
- **Reading lives for one recording.** Compose builds a new Reading when a
  recording begins, on that recording's call text only, so one call's text
  can never reach another call's panel.
- **Recording decides when, Session decides how.** Recording asks for a
  recording to begin or end; the Session it began brings the pieces up and
  down, keeps what they recorded, and tells Recording when it has ended.
  Recording never names a piece, and a Session never decides to stop.
