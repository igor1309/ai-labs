# Audelin architecture

## Grounding

These rules hold for every line of Audelin's code. Re-read them before
designing, specifying or building anything.

1. **A component owns the interfaces it depends on.** It declares each
   collaborator as an interface of its own, shaped by the role that
   collaborator plays for it. It never imports another component, a concrete
   implementation or another component's interface, so it changes only for
   its own reasons.
2. **The outside world lives only in adapters.** That covers the disk and
   file formats, audio devices, the recognition model, the OS and the UI
   toolkit. A component knows none of them. Each file format has exactly
   one reader and one writer.
3. **Each component owns its types.** There is no shared domain module.
   Components with similar types keep their own, and the composition root
   translates between them.
4. **The composition root is a responsibility, and can span several modules.**
   It decides which components are wired and what answers each interface:
   a fake, a stub or the real framework. A composer owns the interfaces at
   its boundary and imports whatever it keeps inside. Coordination that
   decides anything is a state machine with its own tests; composition only
   builds and subscribes. One line of work is one machine: its state holds
   every stage, and its stages are collaborators behind its effect handler,
   never machines that drive each other.
5. **Cross-cutting concerns are decorators at the root.** Logging, metrics
   and retries wrap interfaces in the composition root. No component logs.

## Optional call notes

The user overview delegates panel presentation to Live panel and optional
post-call notes to Call summaries. Existing panel scenario identities and
wording are preserved as that responsibility is separated from the overview.

Summaries is one state machine for the whole line of a call's notes:
recovering a saved job, submitting, claiming, dispatching, generating,
publishing and saving, stopping dispatch and shutdown. Its state holds every
call's stage; storage, generation and preferences are its collaborators. No
coordinator, per-call job model or registry of models sits beside it. It
owns its consumer-owned ports.
SpeakerIdentification accepts supported identity evidence without rewriting the
transcript. SummaryRuntime adapts one bounded process or compatible HTTP
attempt; SummaryFiles owns durable job records and complete note publication.
Each keeps its own types. Settings owns editable configuration, rendered
validation/save/load outcomes and its preference/availability ports.

The root maps those ports and decorates attempts with fallback and logging.
It submits only after the latest final transcript snapshot has been written
successfully and closed, with usable spoken text. Submission does not await
LLM work on recording cleanup. Root lifecycle integration stops dispatch,
drains recording, retains pending handoffs, cancels and joins active summary
resources, then allows termination. Root storage integration coordinates
publication with call rename, deletion and calls-folder moves.

SummaryFiles is also the one reader of published notes: it gives a call's
notes text, none, or why they cannot be read. The calls list holds the
selected call; Call notes presents its notes and progress from Summaries,
and the summary view draws them, Markdown included, beside the list. The app
owns the calls window, its split and, for a narrow window, the call's own
window.

### Making a call's notes on request

The user can make notes for a call that has none, from the calls window,
and cancel them while they are being made.

Summaries owns requested notes as well as notes after recording or merging:
reading the saved input, making, cancelling and retrying all belong to its
one line of work. Its effect handler dispatches to its own transcript,
preferences, storage and generation interfaces. The root answers the
transcript interface with Calls for location and bytes and Transcript format
for reading labelled text. Cancellation stops the attempt and has SummaryFiles
drop its record, leaving the transcript and any earlier notes.

Call notes is a pure presentation component. It offers the selected call's
notes, progress, available actions and formatted publication date, through
its own vocabulary, from supplied progress and saved-note readings. It
depends only on injected pure formatting. It starts no work and holds no
second job lifecycle. The root maps user requests directly to Summaries and
maps its progress and SummaryFiles readings into Call notes; the calls window
renders the result. Changing selection does not stop work.

The app-lifetime summaries composition holds one Summaries machine and the
Call notes presenter, constructed by the Composer factories. There is no
per-call notes machine, job-model registry or coordinator that drives a job
machine. SummaryFiles records publication time and reads notes; Calls gets
notes for search through an injected reading role answered by SummaryFiles,
rather than interpreting published notes itself.

## Merging calls

Recordings owns the calls list's merge interaction and the complete merge
operation, through publication of the joined transcript. Notes are a
separate, ordinary ended-call workload: their failure leaves a successfully
merged transcript readable. The merge never waits for notes or treats their
failure as a failed merge.

### Responsibilities and ownership

All components below declare their collaborator roles themselves. Composer
factories construct them and translate between their vocabularies; only the
composer imports the concrete pieces and swift-imrx.

| Component | Responsibility, dependencies and offering | Holder and lifetime |
| --- | --- | --- |
| Recordings | Extends its list and mutation machine with merge availability, selection, the intervening-call warning, confirmation, work in progress and the resulting call or failure. Depends on its own listing, merging and pure presentation roles. Offers observable list and merge presentation and accepts user interactions and activity reports. Its pure reducer owns the decisions; its effect handler dispatches work and returns outcomes. | The app's calls composition holds one model for the app's lifetime, including while the window is closed. |
| Transcript merge | Purely joins supplied parts in chronological order, offsets their entries from the earliest start, preserves speaker distinctions between parts and inserts explicit gap boundaries. Offers the joined content, earliest start and title and overall time span. Depends on no storage or machine; it does not render Markdown. | The calls composition retains it as a collaborator for merging. |
| Calls | Owns the on-disk call collection, including merged-call membership, staging, publication and the transaction boundary for call mutations and summary publication. Offers logical calls, their locations and content, and collection mutations. Depends on its own disk, admission, naming, folder-creation, transcript-reading, joining, transcript-writing and notes-reading roles. It is the sole reader and writer of merge membership records. | The app's storage composition holds one collection for the app's lifetime. |
| Transcript finishing | Owns the observable lifecycle of final transcript preparation, through attribution, cleanup and final publication. Depends on its own attribution, cleanup and transcript-storage roles. Offers activity and completed transcripts. One async machine holds all unfinished calls and their stages; its pure reducer advances the work and its effect handler only dispatches collaborators. | The recording composition holds one model for the app's lifetime, until finishing has drained on shutdown. |
| CallFolder; CallFolderName | CallFolder creates an exclusively owned folder at a supplied call start, reserving existing identities; it depends on its own disk and naming roles. CallFolderName alone reads and writes folder names. The root answers the naming roles of Calls and CallFolder with it. | Storage composition retains the naming and creation collaborators; each created folder belongs to its call. |
| Transcript format; Transcript file | Transcript format alone reads and writes transcript syntax, including part and gap boundaries. Transcript file creates, replaces and closes transcript bytes through its own file binding. Neither chooses which calls to merge. | Storage composition supplies the format reader and creates a fresh renderer and file writer for each candidate transcript, releasing them when writing ends. |
| CallsListUI; CallsWindowUI | Render supplied merge selection, availability, confirmation, warning and failure alongside the existing list and window controls, and emit interactions. Depend on their own presentation inputs and UI frameworks. | The app's window composition holds the window and toolbar for the window's lifetime and supplies the list view's current presentation. |

The merge interaction belongs to Recordings because selection, ordering and
mutations already belong to the calls list. Transcript joining changes with
what a joined call means; Calls changes with the storage collection and its
publication boundary. Neither needs the other's concrete language.

### Storage and publication

The merged call has its own folder in the calls folder, with a fresh
identity based on the earliest part's start and the earliest part's title.
CallFolderName supplies the collision suffix: the merged call never reuses
a source identity or its notes job. The folder contains its joined
`transcript.md`, merge membership record and, when made, its own notes and
job record. It contains no combined audio.

Each source folder stays at its existing location, with its audio,
transcript and earlier notes untouched. Membership records identify retained
parts independently of their titles. Calls lists the published merged call
in their place, resolves its transcript and notes from its own folder, and
gets its time span from the merge record rather than looking for audio in
that folder. The merged call and its retained parts form one storage group:
rename changes the merged title, delete removes the group, and a calls-folder
move carries the group and preserves its membership. Removing the merged
call must not expose its parts as newly listed calls.

Calls prepares a complete candidate outside the visible collection. The
root binds its transcript roles to Transcript format and Transcript file;
Calls neither concatenates Markdown nor writes transcript syntax. Publishing
the complete candidate and its membership is one atomic visibility change
under the call-storage transaction boundary. Before it, all source calls
are listed; after it, the merged call replaces them. A failed preparation or
publication leaves the source folders and their visibility unchanged. That
same committed membership determines visibility after reopening Audelin.

### Idleness and notes

Composition subscribes to recording activity, transcript-finishing activity
and Summaries progress, and maps them into Recordings' own activity reports.
Transcript finishing remains active through final writes, speaker attribution
and bleed cleanup, even after recording stops and when notes are disabled.
Recordings holds these reported facts and derives the rendered merge
availability through injected pure presentation. Its reducer reads no other
machine and owns mode entry, confirmation and refusal when activity changes.
The intervening-call check uses the whole ordered collection, including
calls hidden by search.

Confirmation starts work only while idle. Calls' admission role rechecks
external activity at publication, so a previously rendered idle answer cannot
publish a merge after recording, finishing or notes work has begun. Such a
refusal leaves the original calls readable. Composition serializes that
final check and publication with activity changes; the storage transaction
protects selected inputs against competing mutations. Recordings holds the
pending operation until publication answers. Composition keeps no separate
merge-work registry or admission workflow beside it.

After successful publication, root wiring maps the completed call into the
same closed-transcript submission used after recording. Summaries alone owns
the subsequent notes workload, using the whole merged transcript, gap context
included, and the ordinary permission, runtime, failure and retry policy.
Earlier parts' notes are never combined or reused as the merged notes. The
root supplies Call notes with that workload's progress and SummaryFiles'
readings, so the new row and selected detail update as notes finish. No merge
effect invokes Summaries, and no presentation machine starts or joins it.

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
words. Transcript writing already works this way. The content type is defined
once, where Live text produces it, and opened only by its readers. The root
chains the operators, as a Combine pipeline is chained where it is subscribed,
and conforms the one content type to each operator's requirement instead of
copying it field by field at every boundary.

So a change to what a transcript holds reaches only its producer and the
readers that use it. Rule 3 holds for what a component reads, not for content
it relays.

Live text keeps each segment's words with their times, as the recogniser
reports them, instead of joining them into strings: they are what the call
said and when, which a reader may need word by word.

### To fix before new work

The code does not yet follow this section. Measured on 2026-11-10: Fill-in,
Side text and Call text each declare the whole text (identity, times, settled
and pending strings), read only its identity and times, and the root rebuilds
it field by field at seven boundaries. Live text drops word times. In order:

1. Make Fill-in, Side text and Call text generic over their content, with the
   root conforming one content type to each. No behaviour changes.
2. Live text keeps each segment's words with their times.
3. Split Transcript file into two adapters that change for different reasons:
   Transcript format renders segments as Markdown, incrementally, and is the
   format's only writer; Transcript file owns the bytes on disk: creating
   (never over a file), replacing whole, rewriting after a kept prefix, and
   closing. Transcript writing stays the component that decides what is
   written during a call; the root chains it, the format and the file.
4. Split save pacing out of Transcript writing (LAB-1146). Transcript writing
   stands in for call text towards Session: start, switch and stop pass
   through, updates reach readers as they come, and stopping returns once
   the last text is kept. Save pacing is an operator generic over what it
   saves: the latest value waiting is saved, never an older after a newer,
   with a pause between saves that the root chooses and finishing ends;
   a failed save is told once until one succeeds. The first changes with
   Session's lifecycle, the second with the disk and the save interval.
   Transcript writing owns the port it hands texts to; the root binds it
   to save pacing, and save pacing's save port to the format and the file.

## Bleed cleanup

After a call on speakers, far-side speech heard by the microphone appears in
the transcript as the user's. One new responsibility answers it: decide from the
words of a call's two sides, with their times (Transcript pipeline), whether the far side leaked, and if so have the
microphone side recognised again from a cleaned microphone and replaced.

BleedCleanup owns that responsibility and nothing else. It is a plain component,
not a state machine: it runs once per ended call, in a fixed order, and nothing
observes it on the way; it keeps no state between calls, so it is not an actor.
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

The root builds BleedCleanup with those answers and supplies it to Transcript
finishing for each recording's closed transcript. That machine holds the
unfinished stage until the cleaned or raw transcript is ready. Root wiring
hands that completion to Summaries instead of submitting at close. Logging
of a kept raw transcript is a root decorator.

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
