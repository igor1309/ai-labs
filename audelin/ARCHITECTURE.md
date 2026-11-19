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
   machines that drive each other. State is what Audelin keeps; what an
   adapter can read again (a file's presence, a folder's contents) is the
   outside world's, not a machine's, and one kept last outcome is a value,
   not a machine.
6. **Cross-cutting concerns are decorators at the root.** Logging, metrics
   and retries wrap interfaces in the composition root. No component logs.

## Components

Each target is one kind. A kind says what the target may import beyond the
platform; anything else breaks rule 1. The lanes of
`scripts/component-diagram.py` follow these kinds.

| Kind | May import | Targets |
|---|---|---|
| Machine | nothing | Recording, Reading, Lifecycle, CallAudioAccess, Recordings, SummarySettings, SummaryJobs, CallDetail, NotesMenu, CallsList, TranscriptFinalization, RecordingConditions, CallNames |
| Plain component or operator | a shared helper | CallText, SideText, FillIn, LiveText, TranscriptWriting, SavePacing, LatestText, BleedCleanup, SpeakerAttribution, SpeakerIdentification, SpeakerNaming, CallObservation, CallsSearch, CallTags, ReRecognition, NameCarry |
| Adapter | the component whose port it answers; a shared helper | the recognisers, MicrophoneCapture, SystemAudioCapture, CallAudioProbe, CoreAudioProcesses, CoreAudioProcessBinding, CallAppProcesses, ZoomAccessibility, BrowserBridge, AudelinNativeHost, CallDiarizer, SummaryRuntime, TemplateFiles, NotesGeneration, CallFolder, TrackFile, TranscriptFile, TranscriptFormat, SummaryFiles, TagsFile, AgentsFile, Calls, CallsStorage, Preferences |
| Shared helper | nothing | SplitRows, CallFolderName, AudioConversion, ModelLoading |
| UI | GlassLedger, NotesMarkdown, other UI | PanelUI, SettingsUI, MenuBar, CallsListUI, CallsWindowUI, SummaryPreviewUI, NotesMarkdown, GlassLedger |
| Composition | anything | Composer, LiveAudio, RecordedCapture, CallsWindowShell, Audelin |
| Test and rehearsal | anything | the crash writers, BlockingTestWork, RenderedText, the rehearsals |

A shared helper is a pure function or value with one reason to change of
its own (a format, a conversion); it holds no domain type, so rule 3
stands. MenuBar is UI that also holds panel presence's pure reducer; the
root composes it as a machine.

Recording's reducer is large because a recording has many pieces, so its
target splits it into files: the Session reducer advances the pieces'
state inside Recording's state and is not a machine or a module of its own.

### Open

The code does not yet follow rules 4 and 5 everywhere. Each item below
becomes part of a machine's state, or is shown to be only mapping:

- The panel's composition builds a Reading and a CallNames for each
  recording and decides what Reading is sent.
- The menu runs panel presence's reducer and its delay by hand.
- The composer holds `NewestText` across events.

No check yet fails on an import that a target's kind does not allow.

## Recording conditions

RecordingConditions is the state machine that says which of the
microphone, call-audio access, calls folder and room are available. Its
state holds the latest readings, whether calls storage is moving, and the
value last published for each condition; it publishes a condition only when
that value changes. Readings carry the moment they were taken, and readings
older than the latest are ignored. While a move holds the calls folder,
the folder is published as moving, a reason of its own beside lost, so
Recording can hold a start for the move rather than refuse it. When the move
lets the folder go, the machine asks for a fresh reading and the folder
stays moving until that reading decides it; a reading asked for before, or
for an earlier move, cannot end it. Room is a pure rule: at least 30 decimal gigabytes free in
an existing folder.

The composer reads the microphone permission and the disk (a disk readings
adapter: whether the folder is a directory, writable, and its free capacity)
at startup, after the microphone request and before a call starts, and
sends them to the machine; after a storage move the machine asks for the
reading through a port the composer answers with the same disk adapter. The
composer refreshes call-audio access at those moments; the machine never
reads access and hears its results only through a subscription. Each changed condition is logged
and sent to Recording in the order it was reduced, and a refresh returns
once its readings are published, so a call never starts on readings older
than its own.

## Optional call notes

SummaryJobs owns making a call's notes; CallDetail owns reading the notes
shown, NotesMenu choosing how they are made. Template files, model answers, published notes and
preferences each have one boundary owner. The components below own their
interfaces, including failures; composition translates between them.

### Generation

**SummaryJobs** is one state machine for the whole generation line, from
recovering or accepting a request through preparing, claiming, generating,
validating and committing its result, including cancellation and shutdown.
Its observable state holds every call's progress, resolved template,
retention choice, candidate notes and outstanding work. A pure reducer
advances it; its effect handler only dispatches to collaborators and sends
back their results. No stage has another machine or job bookkeeping
outside this state.

Its own ports resolve a template, read the final transcript and generation
preferences, claim and recover attempts, identify speakers, make validated
notes, and commit or discard an attempt. It offers progress, failures,
cancellation availability and completed-publication notifications keyed by
call. It admits another run after success, as well as a first run or
retry, and excludes overlapping attempts for a call. An explicit request
runs regardless of whether automatic notes are enabled. Automatic notes
use Default; there is no automatic template selection.

Preparing a new run resolves the selected template afresh and captures it
and the global keep choice for that run. Durable attempts keep this
resolved content so recovery uses the same instructions and heading
requirements. Existing notes are independent of an attempt: failure or
cancellation leaves both published versions intact. Only an accepted,
successful publication changes them. SummaryJobs chooses rotation while
keeping is on and replacement while off, and orders cancellation and
completion. It defers publication while calls storage is moving or
committing and publishes settled on shutdown only once its outstanding
work has ended.

**TemplateFiles** owns Audelin's template folder, its format, parsing and
usability checks. It offers a catalogue with each entry's availability and
reason, resolution of an entry into instructions and heading requirements,
and opening the folder. Its dependencies are its own disk and
folder-opening bindings. It writes shipped Default and Daily only when the
folder is absent; an existing folder is never replenished. A bad file
remains an unusable entry and is never rewritten. Folder failures are
reported too. A built-in Default can always be resolved independently of
those files; an unusable Default file remains visible with its reason
alongside that fallback. A missing or broken explicitly chosen template is
reported, never silently replaced by another template.

Default's shipped content preserves the existing notes contract. Daily's
content asks for continuation, owned actions, blockers, planned fixes and
meetings, distinguishing agreements from suggestions and marking unstated
information and topics not discussed. These are template contents, owned
only by TemplateFiles, rather than generation branches or headings
repeated in composition or the answer reader.

**NotesGeneration** is the adapter for the notes request and model-answer
contract. It offers one validated notes attempt from a transcript,
accepted speaker evidence and resolved template instructions and heading
requirements. It owns faithful base instructions, request construction,
Markdown answer parsing and structural validation against that template's
required and optional headings and nonempty sections. Its own text-attempt
port is answered by SummaryRuntime through composition. It keeps no work
between calls. Structural validation does not establish the truth of model
claims. The root decorates a complete validated attempt with runtime
fallback and logging, so an invalid answer can try the configured fallback
too. SummaryRuntime continues to own bounded process and HTTP execution;
SpeakerIdentification continues to validate identity evidence.
SummarySettings owns editable runtime configuration, rendered validation,
load and save outcomes, and its preference and availability ports.

### Published notes and the keep choice

**SummaryFiles** owns all durable attempts and published notes, including
their encoding, recovery and compatibility with older calls. Its own ports
locate a call within a storage transaction and perform disk operations. It
offers attempt storage and publication, and reads Previous and Current
with their text, made date and template identity and display name. Saved
template attribution survives edits or removal of the template file. An
older call's notes read as Current made with Default, without requiring a
rewrite.

Publication commits the successful attempt and the complete pair together,
applying the requested rotation or replacement. Rotation moves Current to
Previous and drops the older Previous; replacement keeps only new Current.
A failed publication or discarded attempt leaves the pair unchanged.
SummaryFiles owns this durable boundary and its recovery; it reads no
preferences. Readers see a complete pair whose completion agrees with what
was published. CallsStorage provides transaction exclusion with rename,
deletion, merges and folder moves; it does not interpret notes or template
metadata.

**Preferences** owns persistence and missing-value defaults for the one
global keep choice, initially on, and for the user's Zoom name, initially
unknown, which the Zoom observer reads and updates. It offers reading, updating only that
choice and observing successful changes through its settings-storage
binding. Other preference updates preserve it. Toggling it does not prune
saved notes; it affects subsequent runs. The menu edits it through
NotesMenu's preference port; SummaryJobs reads it through its own port.
SummarySettings and SettingsUI do not own or display this choice.

SummaryFiles is the only reader of published notes. **Calls** offers call
folders and transcripts, without reading notes files. **CallsStorage**
continues to expose those transcript reads and folder transactions.
Composition supplies search and list gists with Current from SummaryFiles
alongside the transcript from CallsStorage; neither interprets note
storage or exposes Previous as another call.

### Presentation and menu

**CallDetail** is the state machine for the shown call and its notes
versions. Its state holds the published pair, shown version and template
attribution, and rendered progress or failure alongside existing notes. Its
own ports read published notes; formatting is injected as pure
dependencies. It publishes the shown call's cancellation intention and the
facts the menu needs (call, whether it has notes, the shown notes'
template, whether a run is under way) as plain values. Superseded reads
cannot replace the shown call; failed or cancelled regeneration leaves the
existing pair readable with its outcome. A publication shows the new
Current. Copy uses the shown version.

**NotesMenu** is the state machine for the template menu: one
responsibility, choosing how the shown call's notes are made, with its own
reason to change (catalogue, keep choice and menu rules), apart from
reading notes. Its state holds those facts, the catalogue with
unusable-entry reasons, the keep choice and its save outcome, and folder
outcomes. Its pure reducer decides whether the section is make (no notes)
or make again (notes), offers the keep item only with notes, and disables
every template while a run is under way; cancellation stays with
CallDetail. Opening the menu refreshes the catalogue. Every menu action is
a template: choosing one publishes a generation intention (call,
template), the template of the shown notes included. An unusable template
cannot be chosen; Default remains available.

Its own ports read the catalogue, read and save the keep choice and open
the templates folder; its effect handler only dispatches them. Root
subscriptions give it CallDetail's facts and deliver both machines'
intentions to SummaryJobs, the only route for these actions, returning
progress and publication notifications. Neither machine keeps a record of
an intention's outcome beyond the progress SummaryJobs publishes, drives
another machine from an effect, reads its internals or waits for its
work. Changing the selected call does not stop generation.

**SummaryPreviewUI** renders supplied detail, version choices, template
attribution and the regenerate menu button trailing Copy: one section of
template items headed make or make again, disabled templates with reasons,
the folder action and the global keep check item. It emits user
interactions and owns only layout, styling and toolkit behaviour, with no
observable model or availability policy.

### Construction, ownership and connections

The **Composer** composition root constructs the app-lifetime SummaryJobs
machine, TemplateFiles, NotesGeneration, SummaryFiles and Preferences. The
app retains the assembled machines, boundaries and subscriptions until
shutdown; collaborators are retained through the supplied consumer ports.
It constructs CallDetail and NotesMenu for the lifetime of each detail
presentation and holds them with the calls-window composition. Their state
supplies SummaryPreviewUI, held by its view hierarchy. The root constructs and
holds Calls and CallsStorage with the calls composition for the app
lifetime. No instance is built per job.

Composer maps each consumer's ports to these concrete pieces and
subscribes intentions, progress, publication notifications and global
preference changes. **CallsWindowShell** constructs the detail view from
supplied presentation values and maps its interactions back to CallDetail or NotesMenu;
the app owns that window and its view hierarchy. Both composition packages
keep mappings and subscriptions, without prompt, validation, persistence
format or menu policy.

The root sends SummaryJobs final transcripts from TranscriptFinalization
and storage-transaction availability. On quit it stops dispatch, then
sends shutdown after TranscriptFinalization publishes settled, so the last
final transcripts arrive first. Neither machine waits on the other.

## Shutdown

Lifecycle owns termination policy only. On quit it publishes a quit
intention. The root sends shutdown to each participant: it stops call
detection and shuts Recording down, which ends a running recording and
settles once its pieces are down and its transcript output is delivered; Recordings stops its actions and settles once no folder move holds
the calls folder; TranscriptFinalization settles each call; SummaryJobs ends
its work. Each publishes its own settled outcome, the root sends it to
Lifecycle, and Lifecycle allows termination once all have settled. After a
startup failure Recording does not exist, and the same path waits for the
rest. Lifecycle reads no participant and drives none.

An update that replaced the app relaunches it only through Lifecycle. The root
reports what blocks a relaunch now (an open folder picker, a calls window
action, notes being made); Lifecycle starts the relaunch only while running
with nothing blocking. The relaunch holds the calls-folder claim, so no
recording starts behind it, and a started relaunch publishes the same quit intention.

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

CallsStorage also offers the calls-folder claim, which keeps operations
that conflict on the folder apart. A recording creating its folder, a move
of the calls folder and a relaunch each take the claim; while one holds
it, the others are refused with the reason. Merging selected ended calls
needs no claim, since a new recording never touches their folders. Taking
and releasing are atomic and name the holder's token, so a late release
cannot free another holder's claim. A holder keeps its token in its own
state and releases it through its own effect, also when it stops before
its claim was answered. The claim enforces exclusion only; whether Audelin
is idle and when to relaunch are decided by Recordings and Lifecycle.

CallDetail also owns opening the shown call in its own window. It holds
the request until that call's notes read answers, then publishes the call
as ready to open; another selection drops the request. The previous detail
stays visible until the selected call's read answers, and no selection
clears it. Its pure reducer still decides between notes, unreadable notes,
a pending or failed summary and no summary, and shows progress or failure
of making notes again alongside the notes the call already has.

CallsList is the state machine for the list's own actions. Its state holds
the selection, which a search can hide and show again, the inline rename
being edited, the calls whose summary retry is running, whether a call's
folder is being opened, and why the list's last action failed. Its pure
reducer refuses a rename, retry or open the list cannot take, commits a
rename when the selection moves, and publishes each request it makes:
rename a call or clear the failure for Recordings, retry a summary for
SummaryJobs, open a folder for the app. The composer passes each new
request on and sends its outcome back as an event.

The composer connects the list's visible selection and the SummaryJobs
machine's badge, status text and retry availability to CallDetail, without
passing either machine's internal state. Its notes scan fills the
list's notes marks and gists and tells CallDetail when notes may have
changed. The summary view draws the rendered detail, Markdown included.
The views only render these states and send what the user does.
The app owns the calls window, its split and, for a narrow window, the
call's own window, which it opens when CallDetail publishes the call as
ready to open.

### Making a call's notes on request

The user can make notes for a call that has none, cancel them while they
are being made and retry a failed summary. Making notes with a template,
first or again, is NotesMenu's intention; cancelling a run and retrying a
failed one with its own template are CallDetail's, shown beside that run.
The composer routes them to SummaryJobs, whose work continues when another
call is selected. Neither machine's effect handler starts, cancels or
retries generation. Calls lists folders and reads
transcripts through Transcript format.

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

**Idleness reaches Recordings as an event.** The root maps three outputs
into one value, idle or not: Recording running a call,
TranscriptFinalization finishing a transcript (bleed cleanup included) and
SummaryJobs making notes. It sends the value to Recordings whenever it
changes; Recordings keeps it in its state, which starts as not idle until
the first value arrives. Its reducer checks it when merge mode is entered
and when a merge is confirmed, and does not hold it for the merge: a
recording that starts during a merge goes to a new folder of its own and
never touches the selected calls, so nothing is blocked or refused. The
value may be a moment old; actual conflicts on the folder are kept apart by
the calls-folder claim.

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

## Call tags

The user tags calls by hand and finds them by tags (LAB-1617,
`docs/spec/call-tags/`). New responsibilities: the tags file, the tag
rules, matching tags in search, the filter and the tags editor, changing
a call's tags, and keeping the parts' tags on a merge.

**TagsFile** is the only reader and writer of a call's `tags.txt`; outward
it speaks a call's tags as words, and tells an absent file (no tags) from
an unreadable one. It reads and writes synchronously in folders it is
given and never resolves a call's folder itself.

**CallsStorage supplies resolved folders inside its held turn.** Its turn
is not reentrant, so nothing called within an operation asks it for a
location again. Two operations gain a callback: listing hands each listed
call's resolved folder, wherever its root, to an enrichment step; merging
hands the parts' resolved folders beside the prepared folder to its write
step. A tag write is one operation on the call's resolved folder. The turn
excludes Audelin's own changes, not an edit made in another app.

**CallTags** is a plain operator holding the tag rules: folding case and
ё/е, trimming and deduplicating, taking `#tag` words out of a query,
keeping calls that have every chosen tag, and the tags in use, most used
first. It keeps its own folding.

**CallsSearch matches tags as tags.** Its contract takes a call's tags
beside its title and reports tag matches apart from title matches, so title
ranges stay ranges into the shown title and no phrase spans title and tag.

**Recordings owns the listed calls' tags and changing them.** Its list
port answers each call with its tags or that they are unreadable; the
composition answers it with CallsStorage's listing, enriched by a TagsFile
read per supplied folder. Every reload refreshes tags: opening the window,
a save, a merge, a rename, and a refresh, which also picks up an edit made
outside the app. A list answer applies only if it answers the latest list
request, and a successful save invalidates every list request made before
it and then requests a fresh list, so a snapshot read before the save never
applies. Its one new port, set this call's tags, carries a request id the
outcome echoes; it admits the write only when no move or merge holds the
calls.

**CallsList owns the filter and the tags editor.** Its state holds the
query and the chosen tags, both reset when the window is shown, and one
editor: the call, the draft, the tag being typed with its completion from
the tags in use when editing began, and while a save is pending its request
id. Return or a selection move submits the draft with the typed tag, under a
new request id; an
outcome applies only if its id is the pending one, so a late outcome of an
earlier attempt, even for the same call and the same tags, is ignored. A
failed save keeps the draft and shows the failure for retry, under a new
id. While a save is pending, editing another call is unavailable, so a
pending draft is never replaced. A call saved out of the active filter
leaves the list once the save succeeds. The composer only routes requests
and outcomes.

**A merge writes the union of the parts' tags before it publishes.** In
the merge's write step the composition reads each supplied part folder's
tags with TagsFile and writes their union into the prepared folder beside
the joined transcript. An unreadable part tags file, or a failed write,
fails the merge before publication and puts every part back, as a
transcript write failure does. Calls and Recordings do not learn of tags.

CallsListUI draws row tags and the filter strip; the detail header draws
the tags line and its editing field. They render state and send events.

## Agents file

Settings → General offers to write an `AGENTS.md` that explains the
recordings root to an AI agent (LAB-1647, `docs/spec/agents-file/`, text in
`docs/agents-md.md`). New responsibilities: knowing whether the root has the
file and writing it, and drawing the General row.

**AgentsFile** is the only reader and writer of the root's `AGENTS.md`. It
is given a folder and answers whether the file is there, or that the folder
is unavailable; on request it writes the fixed text whole or not at all,
readable by the user only, and never replaces a file already there. A
failure carries the system's reason. The text is its resource; a test
compares the bytes it writes with `docs/agents-md.md`, so a change to the
call folder layout that updates the doc fails until the resource follows.
It knows nothing of calls, Settings or when to write.

**No machine decides the row.** Whether the file is there is the disk's
state, read when General is built; nothing is kept but the reason of the
last failed write, which the menu composition already keeps for a failed
folder picker in the same way. A write is one quick synchronous call, so
there is no pending write and no stale answer to order.

**Construction, ownership and connections.** The menu composition, which
already builds Settings' state, constructs and holds AgentsFile for the
app's life. Building General's state asks AgentsFile about the current
calls folder from preferences: absent shows the row, present or an
unavailable folder hides it (Recording conditions shows the latter). The
create event writes; success clears the kept failure, a failure keeps its
reason for the row, and the next build of General shows the result.
Nothing else constructs AgentsFile, so no recording, merge, tag or launch
path can write the file. Calls lists only call folders, so the file in the
root is never a call; CallsStorage and Recordings do not learn of it, and a
folder move leaves it behind, so the new root is offered again.

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
made final. TranscriptFinalization is the state machine for that line. It
answers what each call's transcript is in its final form, for every call
recorded, whether or not notes are on, and knows nothing of notes: its
final transcript goes to a receiver port, which the root answers. Its
state holds each call's stage, writing, diarizing, cleaning, committing,
then finalized or failed, with the call's last saved text, the speaker
names taken when its transcript closed, its attributed far side and its
cleaned microphone side; whether the latest write succeeded; whether its
final transcript has been published; whether transcript input has ended; and
whether a shutdown has settled.
Its events are the transcript's opening, each live write's success or
failure, the close with the call's names, each stage's result, each
publication, the end of transcript input and shutdown.

A call whose latest write failed is final as last saved, without further
work. A saved call is diarized (Remote speakers), then cleaned (Bleed
cleanup); cleaned microphone text is committed to the file, and a failed
commit keeps the text as written. A commit renders with the names taken at
close, read once, so a name published later cannot race it. Each call's
final transcript, its entries, whether they hold words, and whether the file
holds the latest text, is published once, and is published when its
receiver has taken it. Entries come from an injected pure mapping.

On shutdown no new model work starts. A call being cleaned is committed
as written with its stages left skipped (Transcript origin), and the
machine stops its cleanup; a call being diarized or
committed is final when that file write returns, since both replace the
file; a call still being written is committed as last saved, its stages skipped, once it closes.
The root sends shutdown on the quit intention. Recording's ordered transcript
subscription sends input ended when Recording's transcript output ends: no more
openings, writes or closes can arrive. The machine publishes settled only after
both shutdown and input ended, with every opened call's final transcript
published, so quit waits on settled alone. A call opening after shutdown but
before input ends is committed as last saved, its stages skipped, once it closes, without model work.
Without Recording the root sends both shutdown and input ended.

Its collaborators are ports it owns: the diarizer (the root's after-call
pass, which also hands its speaker turns to CallNames), microphone cleanup
and its stop, transcript replacement, and the receiver of final
transcripts. The transcript writer only renders and saves: live writes and
whole replacements. The root keeps each call's writer, cleanup inputs and
running cleanup as resource handles until its final transcript is
published, subscribes the machine to Recording's ordered transcript
output (each opening, write and close, keyed by call, none dropped), and
answers the receiver port by handing each final transcript to SummaryJobs
before it releases the call's handles; it subscribes the panel's speaker
rows to the machine.

## Transcript origin

A transcript file tells what made it (`docs/spec/transcript-origin/`):
which Audelin version and build heard each side and with which speech
model, and how each finishing stage ended. No new component is needed;
four change, each for its own reason.

**Transcript format** renders the origin as front matter above the
transcript and reads it back, an absent block as no origin. The origin is
part of what it renders and reads, as the speakers' names are, so it is
saved in the same write as the text it tells of and a merge renders a read
transcript again with it. Notes see none of it: their entries come from the
final transcript, not from the file.

**The root supplies hearing.** It reads the version and build from the
app's bundle once and names the recogniser it wires to each side; it hands
both to each call's transcript writer when it builds it, so every live
write carries them. The rehearsals and tests supply their own values.

**TranscriptFinalization decides the finishing outcomes,** as it already
holds each stage. Its state keeps each call's origin so far; every
replacing write it asks for carries it. The diarizer port reports the
diarizer whose split it saved, or none, and saves the split with the
origin it is given plus that outcome. A commit adds the cleaning outcome:
cleaned, or nothing kept. On shutdown a stage that will not run is
skipped, not silent: a call being cleaned, or closing after shutdown, is
committed once more as last saved, if its latest write was saved, with the stages left marked skipped,
and is final when that write returns. A failed write keeps the origin
saved before it, as it keeps the text.

**Transcript join orders the original calls:** each part brings its
original calls, each a start and an origin join never reads, and the
joined call's are all of them by start, so a remerge interleaves them. The
root maps each part's origin read back by Transcript format into them; a
part with no origin is unknown for each of its original calls, whose starts
**Calls** reads from the part's nested folders, as it already reads their
tracks for duration. The root hands the merging build to the rendering.

## Making a transcript again

The user has a kept call's transcript made again from its audio by this
Audelin (`docs/spec/transcript-again/`, `transcript-again-offer/`,
`previous-transcript/`). Four responsibilities are new: the run as the
user drives it (offer, waits, cancel, outcome); making one transcript from
a call's tracks; keeping the replaced transcript beside the current one;
and telling which transcript a call's notes were made from.

**The run is part of Recordings,** as merging is, not a machine of its
own. A run, a merge, a restore, a rename, a delete and a folder move all
act on listed call folders and must exclude one another; one state holds
them, so each refuses the others with its reason and no second machine
reads Recordings' phase. A run takes minutes, so it locks only its own
call and the folders' layout: renaming or deleting another call goes on. Its state holds the call being made again, its
wait (preparing, hearing with how far, finishing) and the last failure's
reason; whether a row offers the item is a pure rule over the list it
holds, with each row's audio presence, original calls included, and the
idle value it already receives. A recording starting turns that value to
not idle, and the reducer then stops the run. It owns one new port: make
this call's transcript again, reporting each wait, then made or why not,
and stopping when asked. Restoring is a second port on Calls, below. The
row menu draws the offer and sends the request; it decides nothing.

**Re-recognition** is a plain component (rule 5): per run, in a fixed
order, it hears each original call's two tracks, has the far side split
and the microphone side cleaned, carries the old transcript's call-app
names onto the new speakers, joins the original calls, and saves the new
transcript as the call's current one. It keeps nothing between runs;
Recordings holds what is running. Carrying names is Name carry, a plain
component of its own, a pure rule over speaker times: a name moves only
where it and one new speaker overlap mostly each other. It owns its ports: hear a track (reporting how far),
split a call track, clean a microphone side, read the old transcript, and
publish the new one. The root answers them with the parts a live call's
finishing already uses: Live text over the recogniser reading Track file,
the after-call diarizer pass with Speaker attribution, BleedCleanup's
answers, Transcript format to read and render with this build's origin
(Transcript origin), and Transcript join for a merged call. It orders the
same stages as TranscriptFinalization for its own reason: one runs over a
live recording's stream and shutdown, the other over a kept call's files.

**Calls owns the previous transcript.** It lays it out beside the current
one in the call's folder and changes the pair in one step, as a merge is
arranged: recorded before the first file moves, finished or put back when
Calls starts, so a crash leaves the old pair or the new. Publishing a new
transcript drops the older previous; restoring swaps the two. Transcript
file writes the new bytes, never over a file; Transcript format is still
the only reader and writer of the format, so the previous file is read
back with the origin it had or none.

**Notes tell their transcript.** When the root submits a transcript to
SummaryJobs it passes the transcript's identity, a digest of the file it
read, which Summary files saves with the notes beside the template's. The
notes read for CallDetail also reports the current transcript's identity
and whether a previous one exists; CallDetail's reducer marks each set of
notes whose identity is not current's, and notes without one once a
previous exists. Replacing or restoring submits nothing to SummaryJobs;
the root tells CallDetail the shown call's transcript changed, as it tells
it notes may have changed, and CallDetail reads the call again.

The root constructs Re-recognition and the run port's chain with the rest
of the calls window's composition, holds them as long as it holds
Recordings, cancels the chain's task when Recordings asks it to stop, and
maps TranscriptFinalization's and SummaryJobs' outputs into the idle value
as for merging. On shutdown Recordings stops a run as it stops its other
actions and settles once the chain has returned.

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

## Call names

CallNames is a machine with one responsibility: the names of each call's
far-side rows. Its reason to change is how call-app evidence becomes a
name. One machine lives as long as the app and holds every call by key: a
call is kept after its recording ends, until its final transcript is
published, since its after-call pass may run while another recording has
begun. For each call its state holds the evidence it kept from Zoom and the
browser extension, each row's name, the participant IDs the transcript
uses, whether the names are confirmed, and whether the call app is being
watched. The reducer names a row through an injected matcher
(`LiveNames.match`) and confirms names through an injected after-call
rule (`AfterCallNames.names`), both in SpeakerNaming.

Its effect handler watches and closes the call-app sources. Two adapters in
the composer answer that port: the Zoom observer reports who speaks on
Zoom's side, and the browser observer reports the extension's events and
connections.

**ZoomAccessibility** reads Zoom's meeting windows: the Talking label Zoom
shows in Speaker view, each participant tile's name and audio state, and the
user's own name where Zoom shows it. It also decides, as a pure rule, which
far-side participant a reading shows as speaking: the Talking label; else
the only other participant; else the only other unmuted one; else nobody.
The user's tile is told apart by the user's Zoom name, and without that name
the rule names nobody. Its reason to change is what Zoom exposes. The Zoom
observer polls it, reports each change of that speaker to CallNames, and
takes the user's Zoom name through two closures, one that reads the
remembered name and one that remembers a name Zoom showed; the root plugs
both into Preferences. CallNames is unchanged: tile names reach it as
speaker evidence, tentative until the after-call pass confirms them. The root subscribes Recording's
output to it: a recording's start and end start and stop the watch for
that call; its names stay after it.

The root sends it each new remote row of a call, and subscribes its names,
tentative and confirmed, to Reading, which shows them, and to the call's
names port, which keeps the names last published. The transcript writer and the after-call
pass read that port; they never wait for the machine. The pass gives the
speaker turns it diarized back through the same port, and CallNames
confirms the names from them and its kept evidence.
