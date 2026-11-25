# Splitting a call: architecture

The components that make user splitting a call (`SPEC.md`): what each is
responsible for, what it depends on, and who holds and builds it. Splitting
follows merging calls: the same machine phase, the same chain in compose and
the same whole-or-nothing folder work in Calls. `../../../ARCHITECTURE.md`
does not change; the new targets join its kinds table as they are built.

## New responsibilities

1. Finding where a call may be cut: its gaps, longest first, with the
   entries that sound like a meeting ending or starting.
2. Cutting one transcript into two at a time: rows, speakers and origins.
3. Cutting a track into two at a time, with no re-encoding.
4. Replacing one call folder by two, whole or not at all, and putting the
   original back after an interruption.
5. The user's split: choosing a gap, naming the parts, confirming while
   Audelin is idle, and its outcome.
6. Replacing the original's notes job with one for each part.

## Components

| Component | Kind | Responsible for | Depends on (its own ports) |
|---|---|---|---|
| Split points (new) | plain component | Given a transcript's entries (time, length, words), the gaps where it may be cut: between two entries, never leaving a side empty, longest first, each marked when the entry before sounds like an ending or the one after like a start, with the cut at the gap's middle and part 2's start (the first entry after the cut, rounded down to the minute). Owns its phrases. Reason to change: how cuts are suggested. | none |
| Transcript split (new) | operator | The reverse of Transcript join, generic over rows: a call's rows, speakers and original calls, cut at a time, become two parts. Rows go by their start; part 2's rows move back by the cut; each part keeps only the speakers its rows use, keys and names unchanged; each original call goes to the part it starts in, the one spanning the cut to both, its start moved forward in part 2. Reads only rows' times and speaker keys. Reason to change: what cutting a transcript means. | none |
| Track file (changed) | adapter | Adds cutting a finished track into the part before and the part from a time, by stream copy. It stays the one reader and writer of the track format (rule 2). | the audio framework |
| Calls (changed) | adapter | Adds a split port: prepares both part folders out of sight, has the caller write into each, records the split before the original moves, then publishes both parts in the original's place (part 1 under the original's name and id). A failure, or an interruption found when Calls starts, leaves the original as it was. Recovery runs beside the merge recovery, before the first listing. Its reason to change stays the call folders' layout. | the disk |
| Recordings (changed) | machine | Adds a split phase beside merge mode: asks a choices port for the selected call's gaps, holds the chosen gap and both names, refuses while not idle (the idleness value merge already keeps), asks the split port on confirm, selects part 1 in a fresh listing on success, and keeps the sheet open with the reason on failure. One action at a time, as for every action. | a split choices port, a split port |
| Split sheet (new, in CallsWindowUI) | UI | Draws the split phase: gaps with the entries on each side, both names, under way, failure; sends the user's choices. Decides nothing. The toolbar gets a split control. | none |
| Split chain (new, in Composer) | composition | Answers Recordings' two ports, as the merge chain does. Choices: Calls reads the saved transcript, Transcript format reads it back, Split points suggests. Split: Transcript split cuts it, Transcript format renders each part, and inside Calls' split Transcript file writes each transcript, Track file cuts each track, the tags file is copied to both. Returns both parts' ids and entries for notes. | everything it chains |
| Summary calls (changed, in Composer) | composition | Its merge callback becomes a replacement: old calls' jobs dropped, each new call's job offered as an ended recording's. Merge and split both use it. Summary jobs does not change: it already drops a call's job before taking a new one under the same id. | Summary jobs |

## Holding and building

- Compose builds the split chain and Summary calls, and plugs them into
  Recordings' effect handler; Recordings is held where it is today.
- Split points and Transcript split are pure: no state, no holder; the chain
  calls them.
- AudelinCalls maps Recordings' split phase to the split sheet's state and
  follows a finished split to part 1, as it follows a merge.
- The idleness subscription is unchanged; Recordings reads the value it
  already keeps for both merge and split.

```
Recordings ──▶ [split choices] ◁┄┄ split chain ──▶ Calls, Transcript format, Split points
Recordings ──▶ [split]         ◁┄┄ split chain ──▶ Calls ──▶ (write) Transcript split,
                                                    Transcript format, Transcript file,
                                                    Track file, tags file
split chain ──▶ Summary calls ──▶ Summary jobs
Split sheet ┄┄ draws ┄┄ Recordings' state (mapped in AudelinCalls)

──▶ uses   ◁┄┄ answers a port   [x] port owned by its consumer
the split chain, Summary calls and AudelinCalls are composition (the root)
```

## Why this cut

- Suggesting cuts and cutting change for different reasons (how a good cut
  is found, and what a cut transcript is), so they are two components.
- Transcript split is not part of Transcript join: each has one direction
  and is tested on its own; they meet only in compose.
- Cutting audio is the track format's, so it stays in Track file; Calls
  only moves folders and does not learn the format.
- Whole-or-nothing and recovery are Calls', where the merge's already are:
  only Calls knows how a call is laid out on disk.

## Open for the component specs

- Splitting a merged call: whether each nested part's tracks are cut, or a
  nested part goes whole to the side it lies on.
- Whether part 1, keeping the original's id, needs anything more of Summary
  jobs than a merged call keeping its earliest part's id does.
