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
   and an effect handler (`docs/app-shape.md`). One that runs once in a
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

## Components

Each target is one kind. A kind says what the target may import beyond the
platform; anything else breaks rule 1. The lanes of
`scripts/component-diagram.py` follow these kinds.

| Kind | May import | Targets |
|---|---|---|
| Machine | nothing | Recording, Reading, Lifecycle, CallAudioAccess, Recordings, SummarySettings, SummaryJobs, CallDetail, NotesMenu, CallsList, TranscriptFinalization, RecordingConditions, CallNames |
| Plain component or operator | a shared helper | TranscriptLayout, CallText, SideText, FillIn, LiveText, TranscriptWriting, SavePacing, LatestText, BleedCleanup, SpeakerAttribution, SpeakerIdentification, SpeakerNaming, CallObservation, CallsSearch, CallTags, ReRecognition, NameCarry |
| Adapter | the component whose port it answers; a shared helper | the recognisers, MicrophoneCapture, SystemAudioCapture, CallAudioProbe, CoreAudioProcesses, CoreAudioProcessBinding, CallAppProcesses, ZoomAccessibility, BrowserBridge, AudelinNativeHost, CallDiarizer, SummaryRuntime, TemplateFiles, NotesGeneration, CallFolder, TrackFile, TranscriptFile, TranscriptFormat, SummaryFiles, TagsFile, AgentsFile, Calls, CallsStorage, Preferences |
| Shared helper | nothing | SplitRows, CallFolderName, AudioConversion, ModelLoading |
| UI | GlassLedger, NotesMarkdown, other UI | PanelUI, SettingsUI, MenuBar, CallsListUI, CallsWindowUI, SummaryPreviewUI, NotesMarkdown, GlassLedger |
| Composition | anything | Composer, LiveAudio, RecordedCapture, CallsWindowShell, Audelin |
| Test and rehearsal | anything | the crash writers, BlockingTestWork, RenderedText, the rehearsals |

A shared helper is a pure function or value with one reason to change of
its own (a format, a conversion); it holds no domain type, so rule 3
stands. MenuBar is UI that also holds panel presence's pure reducer; the
root composes it as a machine.

A machine's reducer may split into files inside its target; a part of a
reducer is not a machine or a module of its own.

### Open

No check yet fails on an import that a target's kind does not allow.
