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
is kept as an explicit timeline start in transcript origin. This is
independent of the per-recording starts and is preserved by transcript
replacement and restore. Its folder name carries the cut rounded down to the minute. The cut falls
on a whole second, the precision Transcript format saves, so rebased rows
round-trip and a merge puts them back exactly.
The merge chain and Calls place a part, and each original recording inside
it, by their separate timeline and recording starts. Legacy transcripts
without a timeline start retain the existing folder-minute fallback;
lengths come from the tracks. Calls uses recording starts for nested
audio lookup and duration so playback and recognition locate the same
samples as merge. Merge retains a boundary marker for adjacent parts.

## Components

| Component | Kind | Responsible for | Depends on (its own ports) |
|---|---|---|---|
| Split points (new) | plain component | Given a transcript's entries (start and words), the gaps where it may be cut: between two neighbouring entries' starts, never leaving a side empty, longest first, each marked when the entry before sounds like an ending or the one after like a start; the cut on a whole second (at the next entry's start) and part 2's name minute. Gap markers cannot define cut boundaries, and rows with equal starts stay together. No gaps means the call cannot be split. Owns its phrases. Reason to change: how cuts are suggested. | none |
| Transcript split (new) | operator | The reverse of Transcript join, generic over rows and origins: rows, speakers and original calls, cut at a time, become two parts on the clock above. Rows go by their start; each part keeps only the speakers its rows use, keys and names unchanged; each original call goes whole to the side it lies on, or, when it spans the cut, to both, with its own local cut time. Reads only rows' times, speaker keys and originals' starts and lengths. | none |
| Track file (changed) | adapter | Adds cutting a finished track into the part before and the part from a time, by stream copy. Only intersecting samples are copied and a missing track stays absent. It stays the one reader and writer of the track format (rule 2). | the audio framework |
| Calls (changed) | adapter | Adds a split: prepares both part folders out of sight, has the caller write into each, records the split before the original moves, then publishes part 1 under the original's id with its confirmed title and part 2 under its own name. Places each original recording's folder (a merged call's nested ones included) by the original-call plan Transcript split gives: moved whole, or cut through the caller. Before the durable commit decision, failure or recovery restores the original. After the decision, recovery finishes publishing both parts before any listing can see them. Recovery runs beside merge recovery. | the disk |
| CallsStorage (changed) | adapter | Runs the split as one operation of its turn: requires the call to be in the active calls folder, reserves and registers a distinct part 2 id, even when the minute is already in use in its journal, and derives journal reconciliation from the Calls transaction decision. | a folder-transaction port of its own, which compose answers with Calls |
| Summary jobs (changed) | machine | Adds three things. A job may say its speakers are already named, and then skips identification; the flag is saved with the job. Admission as a pure rule of its own, the one ended calls pass (notes on, transcript usable), which the split and merge chains ask before staging a call's pending job. A replacement event: old calls' jobs dropped, then the new calls' stored jobs read and run as recovered jobs are. | its existing ports |
| Recordings (changed) | machine | Adds a split phase beside merge mode. When the selected call or its transcript changes (a new transcript, a restore, a finished split) it asks a choices port for its gaps and keeps them with the transcript's identity, so the toolbar can tell whether splitting is offered, being checked or unavailable and why; the split port is asked with that identity and refuses if the transcript changed since. In the phase it holds the chosen gap and both names, refuses while not idle (the idleness value merge already keeps), asks the split port on confirm, and on success publishes the replacement (original id, both parts' ids) and selects part 1 in a fresh listing; on a precommit failure it keeps the sheet open with the reason. Expired choices are refreshed and must be selected again. A committed split with incomplete publication or a failed list refresh remains in progress with a recovery or refresh message and prevents resubmission. | a split choices port, a split port |
| Split sheet (new, in CallsWindowUI) | UI | Draws the split phase: gaps with the entries on each side, both names, under way, failure; sends the user's choices. The toolbar's split control draws whether splitting is offered. Decides nothing. | none |
| Split preparation (new) | plain component | Owns preparation order and the failure contract behind Recordings' two ports. The composer binds and translates these ports. Choices: CallsStorage reads the saved transcript, Transcript format reads it back, Split points suggests. Split: Transcript split cuts it; inside the CallsStorage split, Transcript format renders and Transcript file writes each part's transcript, Track file cuts each spanning track, the tags file is copied, and, where Summary jobs' admission lets it, Summary files stores each part's pending notes job marked as named, so the jobs are committed with the folders. The merge chain stages the merged call's job the same way. | everything it chains |

## Holding and building

- Compose builds split preparation from its injected ports and plugs it into Recordings' effect
  handler; Recordings and Summary jobs are held where they are today.
- The root subscribes Recordings' published replacement to Summary jobs'
  replacement event, mapping ids only; neither machine drives the other.
  The merge's notes callback moves to the same subscription, with its job
  staged in its transaction as the split's is.
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
the composer binds the split preparation ports and maps AudelinCalls state
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
