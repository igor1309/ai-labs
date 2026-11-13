---
date: 2026-11-09
model: claude-opus-5-5
description: "How Audelin names remote speakers: call observation, timing-based naming, revisioned identity in the single transcript file"
---

# ADR-002: Naming remote speakers

Status: accepted by the owner on LAB-1121 (2026-11-09). Built by LAB-1123 (Zoom),
reused by LAB-1124 (Telemost) and LAB-1125 (Google Meet).

## Decisions (owner, 2026-11-09)

1. **Timing matching.** A roster says who is in the call, not which voice is whose.
   Names come from the call app's active-speaker intervals lined up against the
   speaker turns diarized on the call track (LAB-1103).
2. **Names show live,** when the evidence supports them. Live never means every
   new word gets a reliable name at once.
3. **One transcript file** holds the names; no sidecar.

## Revised after LAB-1103 (owner, 2026-11-10)

LAB-1103 measured that live diarization is not good enough (LS-EEND: 16.6 % speaker error,
right count in 7/16 meetings), while Nemotron after the call is (2.7 % DER, 16/16). So names
come in two tiers:

- **Live, tentative:** a remote row takes the name the call app showed alone over most of it
  (`LiveNames`), with no diarization. It is drawn in the option-C caption, slanted and in the
  gutter grey, and never changes during the call. Overlap or nobody shown leaves `Them`.
- **After the call, confirmed:** Nemotron diarizes the call track, `SpeakerNaming` matches its
  turns against the recorded indicator timeline, and confirmed names replace the tentative
  ones in the amber caption and in the transcript file. Unconfirmed speakers stay
  `Speaker N`. Live names reach the file marked tentative, so a quit before the pass keeps
  them as guesses.

The live tier needs no Accessibility prompt of its own yet: it runs only when the
permission is already granted.

## Components

Each owns its types and the interfaces it depends on (`ARCHITECTURE.md`).

- **Call observation** — one call's roster and speaking activity, normalised from an
  adapter. Inputs carry session epoch, source, sequence, participant ID (session-scoped,
  never the display name), display name, local or remote, observation time and its
  uncertainty. It publishes capabilities: roster, activity, complete or not, healthy or
  stale. AX, native-messaging and DOM structures stay inside the adapters
  (`ZoomAccessibility`, later `BrowserBridge`).
- **SpeakerNaming** (`macos/Sources/SpeakerNaming`, built) — a pure, replayable state
  machine. Input: roster, activity intervals valid through a watermark, and diarized turns
  (`id`, cluster, start, end, overlapped) where a turn's revision replaces the earlier one.
  Output per cluster: unknown, candidate, confirmed or disputed. A cluster split, merge or
  reset drops its assignment; names never carry over by cluster number.
- **Presentation** — accepts text, diarization and identity revisions independently,
  keeps row IDs, selection and scroll anchor when a name changes, and draws the caption
  from LAB-1126 only for confirmed names.
- **Root** picks the adapter from the call app `CallAppProcesses` detects and wires
  observation → naming → presentation and the transcript writer. Deciding which meeting
  is authoritative, reconnects and conflicts are state machines, not composition.

## Time

The call clock is the captured audio's sample position mapped to the host monotonic clock,
kept across resampling, interruptions and capture restarts; never derived from when
recognition finishes. AX observations are stamped on receipt with their polling and
delivery uncertainty. Browser events get a clock offset from timestamped ping/reply,
recalibrated after reconnect or sleep. The app's own indicator lag is measured per adapter
against captured speech and excluded as edge uncertainty — never tuned to whichever name
matches best. History is kept as long as diarization revision lag plus delivery lag plus a
margin; events older than that cannot rename.

## Matching policy

Evidence is **exclusive voiced overlap**: time inside a non-overlapped turn where exactly one
remote participant was shown speaking, edges trimmed by uncertainty, nothing after the
activity watermark, and each turn's influence capped. Local activity counts as a speaker, so
echo and crosstalk are never evidence. Starting thresholds, unvalidated until recorded calls
recalibrate them (`Policy`):

| Parameter | Start |
|---|---|
| evidence window | 30 s |
| candidate | 1 s |
| confirmed | ≥ 4 s over ≥ 2 turns, ≥ 85 % support, ≥ 25 pp lead |
| disputed | ≥ 2 s of another participant over ≥ 2 turns |
| per-turn cap | 3 s |

States: unknown → candidate → confirmed; contradiction → disputed (shown as `Speaker N`);
disputed → confirmed only on evidence after the dispute, so a name never flips straight to
another. Candidate names stay internal. A stale source stops new evidence but keeps earlier
names. A rename changes the text, not the identity; a rejoin is a new epoch. There is no
one-cluster-per-person rule. Mixed rows stay generic unless word timing justifies a split.
`SpeakerIdentification`'s self-introductions are a separate evidence source, never a
tie-breaker against timing.

## Transcript file

Markdown keeps stable generic speaker IDs on rows (`**Speaker s3** 00:01:12`) and one
versioned metadata block after the transcript: `schemaVersion`, `callID`, snapshot revision,
participants, speaker epochs, assignment states with evidence summaries, and per-row
`{id, start, end, speakerID, diarizationRevision}`. A readable Speakers section shows the
mapping in plain Markdown. `TranscriptFile` stays the only reader and writer; summaries use
its decoded snapshot. Snapshots are published by same-directory temporary file → write →
flush → close → atomic replace → directory sync, serialised by revision so a late save never
replaces a newer one. On failure the last complete snapshot stays, the panel shows unsaved
state and the latest snapshot is retried. Shutdown drains naming, writes, closes, then
submits summaries.

## Failure

No Accessibility permission, a missing extension, an unknown AX or DOM layout, a lost bridge
or an unbound meeting disables new naming evidence only — recording and transcription go on,
rows keep generic labels, and the app shows a specific recoverable state. Zoom asks for
Accessibility only when the user turns naming on. Adapters tell "nobody speaking" apart from
"cannot observe" through health and heartbeat.

## Open

- ~~Whether Zoom exposes the speaking indicator through AX~~ — **yes** (probe on a real
  15-person Zoom meeting, 2026-11-10): a static text `Talking: <name>` (empty when nobody
  talks) in the floating video window during screen share, and the participant count on the
  toolbar's `participant` button. Zoom gives display names only, no participant IDs, so
  duplicate names cannot be told apart. The main meeting window can drop out of the AX tree
  while the floating window stays. Still unmeasured: the indicator's lag behind speech, and
  where it appears outside screen share.
- Live latency numbers wait for LAB-1103's measurements (first text, first name, correction
  rate, time to stable identity; p50 and p95).
- The Telemost indicator's lag behind the captured speech. Gristmill starts from an
  unmeasured 300 ms guess (plausible 200–500 ms); Audelin measures it on recorded calls.
- Whether Yandex Browser reads native-messaging host manifests from its own
  `NativeMessagingHosts` folder as Chrome does. Its registration is proved on a real install
  before it is listed as supported.

## Browser calls (Telemost, Google Meet)

### Prior art

Of the open-source recorders surveyed (Gristmill, Meetily, Open Granola, who-said-what),
only Gristmill reads browser calls. Its Companion extension has Telemost and Meet adapters
and feeds the same timing matcher as its Zoom AX reader. None publishes accuracy figures, so
nothing here is measured; the choices follow what Gristmill shows working, and the
thresholds stay `Policy`'s until Audelin's own recorded calls recalibrate them.

Gristmill's Telemost adapter (`extension/src/telemostAdapter.ts`) relies only on test IDs
and structure, not on localised labels or generated class names:

- The call is a same-origin `iframe[allowfullscreen]` whose room (`/j/<14 digits>`) matches
  the top page. Only that frame is read.
- A connected call shows `end-call-alt-button` in a toolbar with Share and Camera; the shell
  widgets present before joining prove nothing.
- Each tile is a `video` under `[data-video-root="true"]`; its name is the one `span[title]`
  whose title equals its text. A mirrored video marks the local tile.
- A remote speaker shows as a green `::after` border on the video overlay
  (`4px solid rgb(29, 204, 102)`). A tile with `micro-off-icon` gives no activity.
- Speaker view shows one person twice; copies with the same non-empty `data-g_track_id` and
  name collapse. Otherwise duplicate names suppress activity.
- Telemost exposes no participant ID. IDs are observation IDs of the DOM node; a replaced or
  renamed node starts a new one.
- The roster is never complete: the participant list is paginated and a hidden tab cannot
  be read.

### Browsers

One Manifest V3 extension for Chromium, supported in **Chrome** and **Yandex Browser**:
Yandex Browser is Chromium and is the one used for Telemost calls, so a single build covers
both. It is loaded unpacked until store publication is its own work. Safari and Firefox are
not supported: each needs a separate extension and host registration, and neither is the
browser these calls run in.

### Channel: native messaging

The extension reaches Audelin through **Chrome native messaging**, as Gristmill does
(`extension/src/worker.ts`, `src/helpers/companionNativeHost.ts`):

- The browser starts a small host executable bundled in the app and talks to it over stdio.
  The browser itself checks the extension's origin against the host manifest's
  `allowed_origins`, so no page or other extension can connect.
- The host relays frames to the running app over a Unix socket in the app's support folder,
  owner-only, authenticated with a credential file only the app and host read. With the app
  not running the host exits and the extension shows the app as unavailable.
- Frames are length-prefixed versioned JSON with a size limit checked before allocation.
  A malformed frame, an unknown version or a replayed sequence closes the connection.
- The worker takes tab, document and call identity from the browser's sender, never from
  the page.

A local WebSocket was rejected: it opens a listening port any local process or web page can
reach, its `Origin` header is checked only by convention, and the port can clash. Native
messaging costs a host executable and one manifest per browser; the app writes both and
repairs them at launch, never overwriting a file it does not own.

### Time and tiers

Browser timestamps reach call time through the ping/reply offset above. The extension's
intervals take the same two tiers as Zoom: live tentative names when one remote participant
is shown alone over most of a row, and confirmed names from `SpeakerNaming` after the call.
Without the extension, or when the adapter reports the page unrecognised, recording goes on
and speakers stay unnamed.
