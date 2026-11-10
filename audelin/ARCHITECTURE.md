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
