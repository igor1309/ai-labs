# Audelin architecture

## Grounding

These rules hold for every line of Audelin's code. Re-read them before
designing, specifying or building anything.

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
   it reads (Transcript pipeline).
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
   machines that drive each other.
6. **Cross-cutting concerns are decorators at the root.** Logging, metrics
   and retries wrap interfaces in the composition root. No component logs.

## Components

Each target is one kind. A kind says what the target may import beyond the
platform; anything else breaks rule 1. The lanes of
`scripts/component-diagram.py` follow these kinds.

| Kind | May import | Targets |
|---|---|---|
| Machine | nothing | Session, Recording, Reading, Lifecycle, CallAudioAccess, Recordings, SummarySettings, SummaryJobs, CallDetail, TranscriptFinalization, RecordingConditions |
| Plain component or operator | a shared helper | CallText, SideText, FillIn, LiveText, TranscriptWriting, SavePacing, BleedCleanup, SpeakerAttribution, SpeakerIdentification, SpeakerNaming, CallObservation, CallsSearch |
| Adapter | the component whose port it answers; a shared helper | the recognisers, MicrophoneCapture, SystemAudioCapture, CallAudioProbe, CoreAudioProcesses, CoreAudioProcessBinding, CallAppProcesses, ZoomAccessibility, BrowserBridge, AudelinNativeHost, CallDiarizer, SummaryRuntime, CallFolder, TrackFile, TranscriptFile, TranscriptFormat, SummaryFiles, Calls, CallsStorage, Preferences |
| Shared helper | nothing | SplitRows, CallFolderName, AudioConversion, ModelLoading |
| UI | GlassLedger, NotesMarkdown, other UI | PanelUI, SettingsUI, MenuBar, CallsListUI, CallsWindowUI, SummaryPreviewUI, NotesMarkdown, GlassLedger |
| Composition | anything | Composer, LiveAudio, RecordedCapture, CallsWindowShell, Audelin |
| Test and rehearsal | anything | the crash writers, BlockingTestWork, RenderedText, the rehearsals |

A shared helper is a pure function or value with one reason to change of
its own (a format, a conversion); it holds no domain type, so rule 3
stands. MenuBar is UI that also holds the pure reducer for panel presence.

### Open

The composer does not yet follow rule 4. It holds state across events
(`NewestText`, `CallLiveNames`, `LiveNameBoard`). Each becomes a component or machine of its own, or is
shown to be only mapping. No check yet fails on an import that a target's
kind does not allow.

## Recording conditions

RecordingConditions is the state machine that says which of the
microphone, call-audio access, calls folder and room are available. Its
state holds the latest readings, whether calls storage is moving, and the
value last published for each condition; it publishes a condition only when
that value changes. Readings carry the moment they were taken, and readings
older than the latest are ignored. While storage moves, the calls folder is
unavailable whatever the disk says; when the move ends, the latest readings
decide it again. Room is a pure rule: at least 30 decimal gigabytes free in
an existing folder.

The composer reads the microphone permission and the disk (a disk readings
adapter: whether the folder is a directory, writable, and its free capacity)
at startup, after the microphone request, before a call starts and after a
storage move, and sends them to the machine. It refreshes call-audio access
at the same moments; the machine never refreshes or reads access and hears
its results only through a subscription. Each changed condition is logged
and sent to Recording in the order it was reduced, and a refresh returns
once its readings are published, so a call never starts on readings older
than its own.

## Optional call notes

The user overview delegates panel presentation to Live panel and optional
post-call notes to Call summaries. Existing panel scenario identities and
wording are preserved as that responsibility is separated from the overview.

SummaryJobs is one state machine for the whole line of a call's notes:
recovering a saved job, submitting, claiming, dispatching, generating,
publishing and saving, stopping dispatch and shutdown. Its state holds every
call's stage; storage, generation and preferences are its collaborators. No
coordinator, per-call job model or registry of models sits beside it. It
owns its consumer-owned ports.
It decides which calls get notes: a call the user asked for always does, a
finished recording only while notes are on, which the preferences port
reports with each prepared job. It holds made notes in a deferred stage while
a calls-storage transaction runs and publishes them, one at a time, once it
ends. After shutdown it publishes settled once nothing it started is in
flight.
SpeakerIdentification accepts supported identity evidence without rewriting the
transcript. SummaryRuntime adapts one bounded process or compatible HTTP
attempt; SummaryFiles owns durable job records and complete note publication.
Each keeps its own types. SummarySettings owns editable configuration, rendered
validation/save/load outcomes and its preference/availability ports.

The root maps those ports and decorates attempts with fallback and logging.
It subscribes SummaryJobs to TranscriptFinalization's final transcripts
(Transcript finalization), so a call's notes start from its final form, and
to CallsStorage's transaction state.
On quit, SummaryJobs stops dispatch and shuts down once TranscriptFinalization
has settled, so the last final transcripts reach it first (Shutdown).

## Shutdown

Lifecycle owns termination policy only. On quit it publishes a quit
intention. The root sends shutdown to each participant: it stops call
detection and shuts Recording down, which ends a running session and settles
once idle; Recordings stops its actions and settles once no folder move holds
the calls folder; TranscriptFinalization settles each call; SummaryJobs ends
its work. Each publishes its own settled outcome, the root sends it to
Lifecycle, and Lifecycle allows termination once all have settled. After a
startup failure Recording does not exist, and the same path waits for the
rest. Lifecycle reads no participant and drives none.

An update that replaced the app relaunches it only through Lifecycle. The root
reports what blocks a relaunch now (an open folder picker, a calls window
action, notes being made); Lifecycle starts the relaunch only while running
with nothing blocking. The relaunch reserves the calls folder, so no recording
starts behind it, and a started relaunch publishes the same quit intention.

### Calls storage

CallsStorage is the transaction adapter for the calls on disk. It owns the
calls journal: its format, the migration from the older list of retained
folders, its validation, and recovery of a move a crash interrupted. Every
operation runs one at a time, a note's publication included, so a note never
lands in a folder that is moving. It refuses to delete, move or commit a
folder while a move is half finished. It publishes whether a move or folder
commit is running, which SummaryJobs receives. SummaryFiles reaches a call's folder only through its
location and transaction port, and keeps no journal. Recordings holds move
and delete policy: it confirms each action, leaves out calls already in the
destination, and reloads its list after a failed rename or delete.

SummaryFiles is also the one reader of published notes: it gives a call's
notes text and made date, none, or why they cannot be read. CallDetail is the
state machine for what the calls window shows beside the list. Its state
holds the selected call's display fields and summary status, the notes read
for it and the rendered detail. Its pure reducer decides between notes,
unreadable notes, a pending or failed summary and no summary. A selection,
summary update or notes change asks its effect handler to read notes;
superseded answers cannot replace the current detail. The previous detail
stays visible until the selected call's read answers, and no selection
clears it.

The composer connects the list's visible selection and the SummaryJobs
machine's badge, status text and retry availability to CallDetail, without
passing either machine's internal state. Its notes scan fills the
list's notes marks and gists and tells CallDetail when notes may have
changed. The summary view draws the rendered detail, Markdown included.
The app owns the calls window, its split and, for a narrow window, the
call's own window; it opens that window after the selected detail is read.

### Making a call's notes on request

The user can make notes for a call that has none, cancel them while they
are being made and retry a failed summary. The composer sends these
actions to SummaryJobs, whose work continues when another call is selected.
CallDetail only decides what the selected call shows; its effect handler
reads notes and never starts, cancels or retries their generation. Calls
lists folders and reads transcripts through Transcript format.

## Transcript pipeline

A call's text flows from the recogniser to its readers: Live text turns what
the recogniser hears into segments; Fill-in and Side text make one side's text
from missed and live audio; Call text merges the two sides in call order; the
transcript file, the panel and the summary read the result.

The components between the producer and the readers are operators, as in
Combine: each is generic over the content it carries and constrains it only by
what it reads. Fill-in, Side text and Call text read a segment's identity and
its start and end, to decide what is final, to order and to merge; each
declares that much as a requirement of its own (rule 1) and never names the
words. The content type, `TranscriptSegment`, is defined
once in the composer and opened only by its readers. The root
chains the operators, as a Combine pipeline is chained where it is subscribed,
and conforms the one content type to each operator's requirement instead of
copying it field by field at every boundary.

So a change to what a transcript holds reaches only its producer and the
readers that use it.

Live text keeps each segment's words with their times, as the recogniser
reports them, instead of joining them into strings: they are what the call
said and when, which a reader may need word by word.

Live text's recognition stream hears a track interval by interval. It loads
the recogniser once for every prepare, applies each recogniser update to the
text once, and keeps an interval it accepted, with that interval's update,
when the hear waiting for it is cancelled: a replay of the interval returns
that update, and a replay overlapping accepted audio hears only what follows
it. Cancelling hearing ends the hear in flight and returns once it has ended.
The composer only converts the stream's updates into `TranscriptSegment` for
Fill-in and Side text.

## Transcript finalization

A recording's transcript is written live; once the recording closes, it is
made final. TranscriptFinalization is the state machine for that line. Its
state holds each call's stage, writing, diarizing, cleaning, committing,
then finalized or failed, with the call's last saved text, its attributed
far side and its cleaned microphone side; whether the latest write
succeeded; and whether a shutdown has settled. Its events are each live
write's success or failure, the close, each stage's result and shutdown.

A call whose latest write failed is final as last saved, without further
work. A saved call is diarized (Remote speakers), then cleaned (Bleed
cleanup); cleaned microphone text is committed to the file, and a failed
commit keeps the text as written. Each call's final transcript, its entries,
whether they hold words, and whether the file holds the latest text, is
published once. Entries come from an injected pure mapping.

On shutdown no new model work starts. A call being cleaned is final at once
as written; a call being diarized or committed is final when that file write
returns, since both replace the file; a call closing afterwards is final as
last saved. The machine publishes settled once no file write is pending.

Its collaborators are ports it owns: the diarizer (the root's after-call
pass, which also confirms live names), microphone cleanup, transcript
replacement, and the receiver of final transcripts. The transcript writer
only renders and saves: live writes and whole replacements. The root keeps
each call's writer and cleanup inputs as resource handles until its final
transcript is published, sends the session's writes and close as events,
and subscribes SummaryJobs and the panel's speaker rows to the machine.

## Bleed cleanup

After a call on speakers, far-side speech heard by the microphone appears in
the transcript as the user's. One new responsibility answers it: decide from the
words of a call's two sides, with their times (Transcript pipeline), whether the far side leaked, and if so have the
microphone side recognised again from a cleaned microphone and replaced.

BleedCleanup owns that responsibility and nothing else. It is a plain component
(rule 5): it runs once per ended call, in a fixed order, and nothing observes it
on the way; it keeps no state between calls, so it is not an actor.
Its gate is a pure rule over its own word type. It owns three ports: clean the
microphone against the call track, hear the cleaned samples, replace the
microphone side of the saved transcript. Any port failing, or hearing nothing,
keeps the raw transcript.

Cleaning is one call to FluidAudio's LocalVQE
manager, which downloads and loads its model, fits the reference to the
microphone and returns 16 kHz samples; the root answers the port with it,
passing the two tracks as recorded. Hearing is Live text over the Parakeet
recogniser, composed by the root over those samples, as Fill-in hears missed
audio. The replacement is rendered by Transcript format, the format's only writer, and saved by Transcript file's replacing whole.

The root builds BleedCleanup with those answers and runs it as
TranscriptFinalization's cleanup stage, returning the heard microphone side
for the machine to commit. Logging of a kept raw transcript is a root
decorator.

## Remote speakers

On a group call every far-side voice reads as "Them". After the call, the
call track is split by speaker and the far side's text is given to the
remote speaker who said it. The microphone track is never split: it is the
user's.

Two responsibilities answer it. Call diarizer is an adapter: it reads the
saved call track and returns speaker turns, from FluidAudio's Nemotron 3
diarizer by default and from VBx when Nemotron cannot load or run, or when
the call has more speakers than Nemotron holds
(`docs/research/diarization.md`). Speaker attribution is a plain component
and an operator on the transcript pipeline: generic over the segment it
carries, it reads segment and word times, gives each far-side segment the
speaker whose turns overlap it most, and splits a segment where the speaker
changes. It keeps no state and owns no ports.

The root chains them over a closed transcript: it diarizes the call track,
maps the turns, attributes the far side's segments and logs the outcome; a
failed diarization leaves the far side as one "Them". When the pass runs
in the app's flow, and how the speakers are labelled and shown, belong to
the transcript, summary and panel.
