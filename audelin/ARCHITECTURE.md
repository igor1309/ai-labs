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
| Machine | nothing | Session, Recording, Reading, Lifecycle, CallAudioAccess, Recordings, SummarySettings, SummaryJobs, CallDetail |
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

The composer does not yet follow rule 4. It holds decisions the sections
below give to the root: submitting notes only after a closed transcript with
usable text, and the shutdown order. It also holds state across events
(`CleanupRuns`, `RecordingConditions`, `NewestText`, `CallLiveNames`,
`LiveNameBoard`). Each becomes a component or machine of its own, or is
shown to be only mapping. No check yet fails on an import that a target's
kind does not allow.

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
SpeakerIdentification accepts supported identity evidence without rewriting the
transcript. SummaryRuntime adapts one bounded process or compatible HTTP
attempt; SummaryFiles owns durable job records and complete note publication.
Each keeps its own types. SummarySettings owns editable configuration, rendered
validation/save/load outcomes and its preference/availability ports.

The root maps those ports and decorates attempts with fallback and logging.
It submits only after the latest final transcript snapshot has been written
successfully and closed, with usable spoken text. Submission does not await
LLM work on recording cleanup. Root lifecycle integration stops dispatch,
drains recording, retains pending handoffs, cancels and joins active summary
resources, then allows termination. Root storage integration coordinates
publication with call rename, deletion, merging and calls-folder moves.

### Calls storage

CallsStorage is the transaction adapter for the calls on disk. It owns the
calls journal: its format, the migration from the older list of retained
folders, its validation, and recovery of a move a crash interrupted. Every
operation runs one at a time, a note's publication included, so a note never
lands in a folder that is moving. It refuses to delete, move or commit a
folder while a move is half finished. It publishes whether a move or folder
commit is running. SummaryFiles reaches a call's folder only through its
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

## Merging calls

The user merges calls that were one call, from the calls list, while
Audelin is idle. Four responsibilities are new: the merge as the user
drives it (merge mode, the selection, the far-apart warning, the outcome);
joining transcripts; laying the merged call out on disk; and telling the
rest of Audelin that a merge happened.

**The merge is part of Recordings,** the calls list's machine, not a
machine of its own. Rename, delete, a folder move and a merge all act on
the listed call folders and must exclude one another; one state holds them,
so no second machine has to read Recordings' phase or wait for it. Merge
mode, the selected calls, the warning and the failure's reason are in its
state; whether a selection is far apart is a pure rule over the list it
already holds. It owns one new port: merge these calls, reporting merged
or why not. The calls list and the calls window's toolbar draw merge mode
and send its events; they decide nothing.

**Idleness reaches Recordings as a dependency of its reducer:** an "is
Audelin idle?" query, asked when merge mode is entered and when a merge is
confirmed. The composition answers it from what it already knows: a call
recording, a transcript being finished (bleed cleanup included) and notes
being made. Idle is checked at those two moments, not held for the merge: a
recording that starts during a merge goes to a new folder of its own and
never touches the selected calls, so nothing is blocked or refused.

**Transcript join** is a plain component and an operator in the sense of
the transcript pipeline: given each part's start and rows, it puts them in
time order on the merged call's clock and puts a gap between parts. It
reads only times and speaker keys, giving each part's speakers a key of
that part so two parts' speakers are never taken for one; it keeps no
state and owns no ports. **Transcript format**,
the format's one writer and reader, gains a gap row, and reads a saved
transcript back as fully as it writes it, so a part's rows are written
again as they were.

**Calls owns the layout.** The merged call is a call folder named as the
earliest part, so it keeps that part's id, start and title, and holds the
joined transcript beside the parts' folders, moved inside it whole and
unchanged, audio included. The list shows only top-level call folders, so
the parts leave it and the merged call takes their place; rename, delete,
search and a folder move treat it as any call. Calls arranges the folders
whole or not at all, and recovers an interrupted merge as it recovers an
interrupted move, so a failure leaves every part where it was. It reads a
merged call's duration from its parts' tracks. Transcript file writes the
joined transcript's bytes, never over a file.

**The root answers the merge port** by chaining them: Calls reads each
part's transcript, Transcript format reads it back, Transcript join joins,
Transcript format renders, Transcript file writes into a folder not yet
listed, and Calls arranges the folders. Its storage integration, as for
delete, drops what the notes side holds for the parts.

**The merged call's notes are made as an ended call's are.** On the merge
outcome the root submits the joined transcript to Summaries, as it does when
a recording's transcript closes. Recordings selects the merged row, and that
selection, as any other, tells CallDetail what to show; CallDetail and
Summaries keep their own responsibilities and stay connected by the app's
subscriptions. The parts' own notes stay inside their folders and are not
shown.

The root constructs Transcript join and the merge port's chain with the
rest of the calls window's composition, and holds them as long as it holds
Recordings.

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

The root builds BleedCleanup with those answers and runs it on each recording's
closed transcript. Summary submission waits for its outcome instead of the
close and is handed the transcript it produced, cleaned or raw. Logging of a kept raw
transcript is a root decorator.

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
