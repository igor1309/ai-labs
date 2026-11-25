# Splitting a call: architecture

The components that make user splitting a call (`SPEC.md`): what each is
responsible for, what it depends on, and who holds and builds it. Splitting
follows merging calls where merging is sound: a Recordings phase, a chain in
compose, and whole-or-nothing folder work in Calls under CallsStorage.
`../../../ARCHITECTURE.md` does not change; the new targets join its kinds
table as they are built.

## New responsibilities

1. Finding where a call may be cut, and whether it may be cut at all.
2. Cutting one call's transcript and original recordings at a time, on one
   clock.
3. Cutting a track into two at a time, with no re-encoding.
4. Replacing one call folder by two, whole or not at all, with each part's
   notes job committed in the same step.
5. The user's split: choosing a gap, naming the parts, confirming while
   Audelin is idle, and its outcome.
6. Replacing the original's notes job with one for each part, without
   identifying speakers again.

## One clock

Part 2's clock starts at the cut. Its rows move back by the cut, its audio
starts at the cut, and its exact start, the original's start plus the cut,
is kept in its transcript origin. Its folder name's minute (the first entry
after the cut, rounded down) is a name, as an original recording's minute
already is. The merge chain places a part by its exact start from the
origin, falling back to the folder minute only for transcripts without one.

## Components

| Component | Kind | Responsible for | Depends on (its own ports) |
|---|---|---|---|
| Split points (new) | plain component | Given a transcript's entries (start and words), the gaps where it may be cut: between two neighbouring entries' starts, so never inside an entry and never leaving a side empty, longest first, each marked when the entry before sounds like an ending or the one after like a start; the cut at the gap's middle and part 2's name minute. No gaps means the call cannot be split. Owns its phrases. Reason to change: how cuts are suggested. | none |
| Transcript split (new) | operator | The reverse of Transcript join, generic over rows and origins: rows, speakers and original calls, cut at a time, become two parts on the clock above. Rows go by their start; each part keeps only the speakers its rows use, keys and names unchanged; each original call goes whole to the side it lies on, or, when it spans the cut, to both, with its own local cut time. Reads only rows' times, speaker keys and originals' starts and lengths. | none |
| Track file (changed) | adapter | Adds cutting a finished track into the part before and the part from a time, by stream copy. It stays the one reader and writer of the track format (rule 2). | the audio framework |
| Calls (changed) | adapter | Adds a split: prepares both part folders out of sight, has the caller write into each, records the split before the original moves, then publishes part 1 under the original's id with its confirmed title and part 2 under its own name. Places each original recording's folder (a merged call's nested ones included) by the original-call plan Transcript split gives: moved whole, or cut through the caller. A failure, or an interruption found when Calls starts, leaves the original as it was; recovery runs beside the merge recovery. | the disk |
| CallsStorage (changed) | adapter | Runs the split as one operation of its turn: finds which calls folder owns the call, reserves and registers part 2's id in its journal, and publishes the transaction, as for every call change. | Calls |
| Summary jobs (changed) | machine | Adds two things. A job may say its speakers are already named, and then skips identification; the flag is saved with the job. A replacement event: old calls' jobs dropped, then the new calls' stored jobs read and run as recovered jobs are. Merge uses the same event. | its existing ports |
| Recordings (changed) | machine | Adds a split phase beside merge mode. When the selected call changes it asks a choices port for its gaps and keeps them, so the toolbar can tell whether splitting is offered. In the phase it holds the chosen gap and both names, refuses while not idle (the idleness value merge already keeps), asks the split port on confirm, and on success publishes the replacement (original id, both parts' ids) and selects part 1 in a fresh listing; on failure it keeps the sheet open with the reason. | a split choices port, a split port |
| Split sheet (new, in CallsWindowUI) | UI | Draws the split phase: gaps with the entries on each side, both names, under way, failure; sends the user's choices. The toolbar's split control draws whether splitting is offered. Decides nothing. | none |
| Split chain (new, in Composer) | composition | Answers Recordings' two ports. Choices: CallsStorage reads the saved transcript, Transcript format reads it back, Split points suggests. Split: Transcript split cuts it; inside the CallsStorage split, Transcript format renders and Transcript file writes each part's transcript, Track file cuts each spanning track, the tags file is copied, and Summary files stores each part's pending notes job marked as named, so the jobs are committed with the folders. | everything it chains |

## Holding and building

- Compose builds the split chain and plugs it into Recordings' effect
  handler; Recordings and Summary jobs are held where they are today.
- The root subscribes Recordings' published replacement to Summary jobs'
  replacement event, mapping ids only; neither machine drives the other.
  The merge's notes callback moves to the same subscription.
- After an interruption past publishing, Summary jobs finds each part's
  stored job at launch as it finds any stored job, so both parts get notes.
- Split points and Transcript split are pure: no state, no holder.
- AudelinCalls maps Recordings' split phase and choices to the sheet and
  the toolbar, and follows a finished split to part 1, as it does a merge.

```
Recordings ──▶ [split choices] ◁┄┄ split chain ──▶ CallsStorage, Transcript format, Split points
Recordings ──▶ [split]         ◁┄┄ split chain ──▶ CallsStorage ──▶ Calls
                                   (writes: Transcript split, Transcript format, Transcript file,
                                    Track file, tags file, Summary files)
Recordings' replacement ┄┄ subscribed ┄┄▶ Summary jobs' replacement event
Split sheet ┄┄ draws ┄┄ Recordings' state (mapped in AudelinCalls)

──▶ uses   ◁┄┄ answers a port   ┄┄▶ root subscription
the split chain and AudelinCalls are composition (the root)
```

## Why this cut

- Suggesting cuts and cutting change for different reasons, so they are two
  components; Transcript split and Transcript join each have one direction.
- The original-call plan is Transcript split's because original calls'
  times live on the transcript's clock; Calls only applies it to folders,
  and Track file only cuts.
- Notes jobs are written with the folders so a split is whole after any
  interruption; replacing jobs in memory is Summary jobs' own event, fed by
  a subscription, not a callback from the split.

## The call app

Audelin keeps the call app only in a call's title. Part 1 keeps the original
title and part 2 is suggested it, so both carry the app unless the user
renames them.

## Open for the component specs

- A gap is measured between entries' starts, since saved entries have no
  end; the last words before the cut may run into its first half.
