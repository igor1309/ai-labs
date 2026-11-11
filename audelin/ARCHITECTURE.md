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
   builds and subscribes.
5. **Cross-cutting concerns are decorators at the root.** Logging, metrics
   and retries wrap interfaces in the composition root. No component logs.

## Optional call notes

The user overview delegates panel presentation to Live panel and optional
post-call notes to Call summaries. Existing panel scenario identities and
wording are preserved as that responsibility is separated from the overview.

SummaryJobs owns the generation state machine and its consumer-owned ports.
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
selected call; the summary preview draws that call's notes, Markdown
included, and the app owns the window that holds it.

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

The root builds BleedCleanup with those answers and runs it on each recording's
closed transcript. Summary submission waits for its outcome instead of the
close and is handed the transcript it produced, cleaned or raw. Logging of a kept raw
transcript is a root decorator.
