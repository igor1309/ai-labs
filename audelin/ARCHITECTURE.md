# Audelin architecture

The rules every line of Audelin's code follows, and the kinds of component
they allow. Re-read them before designing, specifying or building anything.

What this file holds, and what it does not:

- **It holds rules:** how components depend on each other, where the
  outside world is reached, who owns which types, what composition may do,
  and the kinds of target with what each may import.
- **It holds no feature design.** What a component does, which ports it
  owns, which machine holds which state and why: all of that is the
  component's spec under `docs/spec/`, the oracle for its behaviour, with
  its reasons in that spec's `## Decided`. A feature changes this file only
  when it needs a new rule or a new kind of component.
- **It names no code** beyond each target's kind. Types, files and
  wiring live in the code; `scripts/component-diagram.py` draws the targets
  as built.

## Rules

1. **A component owns the interfaces it depends on.** It declares each
   collaborator as an interface of its own, shaped by the role that
   collaborator plays for it, so it changes only for its own reasons. It
   imports no other component, no concrete implementation and no other
   component's interface, except as the kinds below allow.
2. **The outside world lives only in adapters.** That covers the disk and
   file formats, audio devices, the recognition model, the OS and the UI
   toolkit. A component knows none of them. Each file format has exactly
   one reader and one writer.
3. **Each component owns the types it reads.** There is no shared domain
   module. Components with similar types keep their own, and the
   composition root translates between them. Content a component only
   relays is not read: an operator is generic over it and names only what
   it reads (rule 7).
4. **The composition root builds and subscribes; it decides nothing.** It is
   a responsibility and can span several modules (the composer packages
   and the app). It chooses what answers each interface (a fake, a stub or
   the real framework), maps types between ports, subscribes one machine's
   output to another's events and applies decorators. A composer owns the
   interfaces at its boundary and imports whatever it keeps inside. A rule
   that picks between outcomes, orders steps or keeps state across events
   is not composition: it belongs to a component or a machine with its own
   tests.
5. **Decisions over time are state machines.** A component that keeps state
   across events and others observe on the way is a machine: a pure reducer
   and an effect handler (§ Machines). One that runs once in a
   fixed order, keeps nothing between runs and is observed by no one is a
   plain component. One line of work is one machine: its state holds every
   stage, and its stages are collaborators behind its effect handler, never
   machines that drive each other. State is what Audelin keeps; what an
   adapter can read again (a file's presence, a folder's contents) is the
   outside world's, not a machine's, and one kept last outcome is a value,
   not a machine.
6. **Cross-cutting concerns are decorators at the root.** Logging, metrics
   and retries wrap interfaces in the composition root. No component logs.
7. **Components between a producer and its readers are operators.** As in
   Combine, an operator is generic over the content it carries and
   constrains it only by what it reads, declared as a requirement of its
   own. The content type is defined once, at the root, and opened only by
   its readers; the root chains the operators and conforms the content to
   each requirement. A change to what the content holds reaches only its
   producer and the readers that use it.

## Machines

The app's own decisions (what to record, what the panel shows, what
happens to calls and settings) are state machines made of separate parts,
without Combine. Components that already have a responsibility of their
own (live text, call text, the recognizers, the process and capture
components) keep it and their own ports; the machines use them as
collaborators.

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

### One line of work, one machine

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

### Event sources merge in a mapping

A machine with several sources gets them through a merge: a thin, pure
mapping that takes each source's stream and delivers one stream of the
machine's own events. It translates the sources' types into the machine's
(rule 3) and is tested as a mapping. Compose applies it.
No source knows the machine, and no machine knows a source.

### Views draw state

The panel, the menu bar item, the settings screen, setup and the launch
blocker and the error screens draw a machine's state and send its user
events. They decide nothing.

## Components

Each target is one kind. A kind says what the target may import beyond the
platform; anything else breaks rule 1. The lanes of
`scripts/component-diagram.py` follow these kinds.

| Kind | May import | Targets |
|---|---|---|
| Machine | nothing | Recording, Reading, Lifecycle, CallAudioAccess, Recordings, SummarySettings, SummaryJobs, CallDetail, NotesMenu, CallsList, TranscriptFinalization, RecordingConditions, CallNames |
| Plain component or operator | a shared helper | TranscriptLayout, TranscriptSplit, SplitPoints, SplitPreparation, CallText, SideText, FillIn, LiveText, TranscriptWriting, SavePacing, LatestText, BleedCleanup, SpeakerAttribution, SpeakerIdentification, SpeakerNaming, CallObservation, CallsSearch, CallTags, ReRecognition, NameCarry |
| Adapter | the component whose port it answers; a shared helper | the recognisers, MicrophoneCapture, SystemAudioCapture, CallAudioProbe, CoreAudioProcesses, CoreAudioProcessBinding, CallAppProcesses, ZoomAccessibility, BrowserBridge, AudelinNativeHost, CallDiarizer, SummaryRuntime, TemplateFiles, NotesGeneration, CallFolder, TrackFile, TranscriptFile, TranscriptFormat, SummaryFiles, TagsFile, AgentsFile, Calls, CallsStorage, Preferences |
| Shared helper | nothing | SplitRows, CallFolderName, AudioConversion, ModelLoading |
| UI | GlassLedger, NotesMarkdown, other UI | PanelUI, SettingsUI, MenuBar, CallsListUI, CallsWindowUI, SummaryPreviewUI, NotesMarkdown, GlassLedger |
| Composition | anything | Composer, LiveAudio, RecordedCapture, CallsWindowShell, Audelin |
| Test and rehearsal | anything | the crash writers, BlockingTestWork, RenderedText, CallsRehearsalSupport, the rehearsals |

A shared helper is a pure function or value with one reason to change of
its own (a format, a conversion); it holds no domain type, so rule 3
stands. MenuBar is UI that also holds panel presence's pure reducer; the
root composes it as a machine.

A machine's reducer may split into files inside its target; a part of a
reducer is not a machine or a module of its own.

### Open

No check yet fails on an import that a target's kind does not allow.
