---
description: "Audelin's main shape: state machines split into reducer and effect handler, connected only by the composition root's subscriptions."
status: proposed
---

# App shape

How Audelin's behaviour around a call is organised: what starts and stops a
recording, what the panel shows, what happens to a call's folder. The
components it names follow `../ARCHITECTURE.md`; what each one does is
specified in its own `SPEC.md` (`spec-process.md`).

## The pattern

The app's own decisions (what to record, what the panel shows, what
happens to calls and settings) are state machines made of separate parts,
borrowed from the owner's `RxViewModel` (swift-vortex, iFora), without
Combine. Components that already have a responsibility of their own (live
text, call text, the recognizers, the process and capture components) keep
it and their own ports; the machines use them as collaborators.

| Part | What it is | How it is tested |
|---|---|---|
| Reducer | A pure function: `(State, Event) -> (State, Effect?)` | Tables of event in, state and effect out |
| Effect handler | A dispatcher: reads the effect and hands it to the one collaborator it was given for it, then turns the result into an event. It has no logic and keeps nothing | Fakes behind its collaborators |
| Model | The generic loop: takes events one at a time, reduces, publishes the state, hands the effect to the handler, and feeds the handler's events back in | Once, generically |
| Compose | Builds one machine from its reducer, handler and model, and subscribes other machines' outputs to its events | Wiring tests only where no component test shows it |

A reducer never does I/O. A handler never decides: when a choice depends on
state, the reducer makes it and names it in the effect, with the identity
of what it acts on (a recording, a folder, a claim), so the handler needs
no memory. A sequence is the reducer's too: each step is one effect, and
its result comes back as the event that leads to the next step. What is
started, running or stopping is in the state, never in a handler, adapter
or wrapper.

## One line of work, one machine

A line of work that runs as one sequence is one machine whose state holds
every stage; its stages are collaborators, not machines of their own.
Machines with responsibilities of their own are connected, not stacked:
the root subscribes one machine's output to another's events, and the
receiver takes only the value it needs. No machine starts, cancels, waits
on or reads another. Where two would need to, they are one machine.

None of these exists in the app:

- an effect, doer or adapter that sends events to another machine;
- a registry of models, one per item: a machine holds its items by key;
- a reducer that reads another machine through a closure;
- a wait or join that only syncs two machines;
- a wrapper that remembers what it started.

## Event sources merge in a mapping

A machine with several sources gets them through a merge: a thin, pure
mapping that takes each source's stream and delivers one stream of the
machine's own events. It translates the sources' types into the machine's
(`ARCHITECTURE.md` rule 3) and is tested as a mapping. Compose applies it.
No source knows the machine, and no machine knows a source.

## The machines

### Recording

Owns a recording's life: whether one runs, and bringing its pieces up and
down. Deciding that a recording should end and taking its pieces down
change for the same reason, so they are one machine.

- **State:** automatic or manual, the conditions, and the current
  recording's stage: claiming call audio, claiming the calls folder,
  bringing its pieces up, running, bringing them down, released. Each
  piece's state and fault, the calls-folder claim it holds, and whether a
  shutdown has settled.
- **Events, from merged sources:** a call starting and ending (Core Audio
  processes); the user's start and stop (panel and menu bar); automatic
  recording and live text (Settings); the conditions (RecordingConditions);
  each collaborator's result; shutdown.
- **Collaborators:** call-audio access, the calls-folder claim, the call's
  folder, the models check, the call app's processes, the captures, the
  track files, call text, the transcript file and live text.
- **Output:** what the recording is doing, for the panel, the menu bar and
  panel presence; and, in order and keyed by call, each transcript opening,
  write and close, for TranscriptFinalization. Nothing in that output is
  dropped, and a close follows the last save.

A stop may arrive while the recording is still starting: the reducer takes
down what came up, and a claim that succeeds after the stop is released.
On shutdown it ends the running recording and settles once its pieces are
down and its transcript output is delivered. A second recording may start
while the previous call is still being finalized; that call's later work
belongs to TranscriptFinalization and CallNames, not to Recording.

The reducer is large because a recording has many pieces. It may be split
into pure functions and files; it is not split into machines.

### Reading

Owns what the panel shows. One Reading lives as long as the app.

- **State:** the recording it shows, its text, held selections, scroll
  position, elapsed time, speaker places, the names shown (tentative or
  confirmed) and the problems.
- **Events:** the recording's identity and state (Recording); call text
  updates; the names (CallNames); the panel's hold, let go, scroll and
  jump to live; a clock tick.
- **Effects:** none.

Every event carries its recording's identity. A new recording resets the
state, and an event of another recording changes nothing, so one call's
text can never reach another call's panel. The ended recording stays shown
until the next one begins. What the panel shows (which text, which
elapsed time, which names) is decided by the reducer, not by the panel's
composition.

### Call names

Owns the names of each call's far-side rows (`ARCHITECTURE.md`, Call
names). One machine holds every call by key: a call is kept after its
recording ends, until its final transcript is published, because its
after-call pass may run while another recording has begun.

### Panel presence

Decides whether the floating panel is visible. A recording beginning opens
it; ending requests a hide after three seconds. A new recording cancels
that hide, and a hide requested for an earlier recording never hides a
later one. Closing hides it for the current recording; the menu offers
«Показать панель» only while recording with the panel hidden. Reopening
the app or asking for the panel shows it.

It is a machine: its reducer holds the pending hide, and its effect
handler waits the delay through an injected sleep and sends the result
back. The root subscribes Recording's output to its events, logs
visibility and reasons through the `panel` sink, and connects the panel's
window to its state. The app target owns the non-activating AppKit panel
above normal and full-screen windows on every Space. It starts as a
360×560-point column at the main screen's visible right edge and autosaves
its moved or resized frame across launches.

### Settings

Decides the user's preferences: the recognition engine and its chunk,
automatic recording, live text on or off, the calls folder's location.

- **Events:** the choices from the settings screen and the menu bar; the
  results of its effects.
- **Effects:** store a preference.
- Its state feeds Recording (automatic recording and live text) and call
  text's recognizer choice, through subscriptions. Moving the calls folder
  is the user's action in Recordings.

### Recordings

Decides what happens to recorded calls and the calls folder: rename,
delete, merge and moving the folder.

- **Events:** the user's actions; whether Audelin is idle for a merge;
  its collaborators' results; shutdown.
- **Collaborators:** the calls on disk, and the calls-folder claim for a
  folder move.
- Listing is a plain read through the folder adapter, not a machine.

## Views of state

The panel, the menu bar item, the settings screen, setup and the launch
blocker and the error screens draw a machine's state and send its user
events. They decide nothing. Setup and the launch blocker draw the
conditions as their merge mapping combines them; readiness is no machine
of its own.

## Data flow

Compose connects a recording's pieces when they are built, translating
types between them:

- Each capture writes its track file, and feeds call text's live audio.
- Each track file is read back as call text's written track.
- Call text's updates feed Reading and the transcript file.

Recording only starts and stops these pieces; audio and text never pass
through a machine.

## Components in this shape

| Component | Role in this shape |
|---|---|
| Core Audio processes | Source of call start and end for Recording |
| Call app processes | Recording's collaborator: which processes to capture |
| System audio capture, microphone capture | Recording's collaborators: the call's tracks |
| Track file, transcript file, call folder | Recording's collaborators: the call on disk |
| Call text | Recording's collaborator; its updates feed Reading |
| Side text | Inside call text, one per side: that side's text to its end |
| Fill in | Inside side text: gets live text ready and reads it what it missed |
| Transcript writing | Around call text, a decorator at the root: keeps its text in the transcript file |
| Live text, the recognizers, model loading | Inside call text, behind its ports; model loading also feeds the conditions |
| PanelUI, SettingsUI, MenuBar | Renderers; MenuBar also holds panel presence's reducer |
