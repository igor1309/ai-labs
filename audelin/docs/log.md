# Log

## 2026-11-14

- LAB-1469: The calls list's selection, inline rename, summary retry and opening a call's folder, and opening a call in its own window once its notes are read, are decided by the list and detail state machines instead of the app's composition; behaviour is unchanged.
- LAB-1533: Names the after-call pass confirms reach the finished call in the panel, shown as confirmed rather than tentative.
- LAB-1418: The calls window can merge calls: a toolbar control enters merge mode, the user marks calls and confirms, and their transcripts join into one call whose notes are made again; audio stays as it was, calls far apart ask first, and merging waits until Audelin is idle.
- LAB-1470: The panel's live text feed is a generic latest-text operator, given the rule that a listening state replaces the text; behaviour is unchanged.
- LAB-1466: One state machine per recording names the far-side rows from Zoom's Talking indicator or the browser extension and confirms them after the call; the panel and the transcript take their names from it.
- LAB-1467: Recognising each call side, including keeping audio already heard when live text is switched off and back on, now belongs to Live text instead of the app's composition; behaviour is unchanged.
- LAB-1465: One state machine decides which recording conditions are met, from the microphone permission, call-audio access, the calls folder and its free room; readings that arrive late no longer overwrite newer ones, and the calls folder stays unavailable while storage moves.
- LAB-1464: Quit and an update relaunch wait until recording, transcript finalization, notes and calls storage have each finished their own shutdown; quitting after call watching failed to start takes the same path.
- LAB-1463: A finished call's notes wait while a calls folder move or commit runs and are saved once it ends; the notes machine itself decides which calls get notes and reports when shutdown has settled.
- LAB-1462: One state machine makes each recording's transcript final: diarized, cleaned and committed, or kept as written. On quit, a call still being cleaned gets its notes from the transcript as written, and quit waits only for transcript files still being replaced.
- LAB-1461: A calls-storage component keeps the record of call moves and folder ownership and refuses to touch a call while a move is half finished; the calls list reloads after a failed rename or delete and skips calls already in a chosen folder.
- LAB-1457: Every Monday a Developer ID signed, notarized Audelin is published to the releases of the public igor1309/audelin repository, when the app changed since the last one.
- LAB-1458: The Settings tab bar is the same segmented picker as Language and Appearance: Tab reaches it with keyboard navigation off, the arrow keys switch tabs, and each tab is a radio button to assistive apps.
- LAB-1423 (LAB-1421): Settings draws its tabs, Language, Appearance and the debug chunk size as one native-style segmented control. Keyboard focus rings the focused segment inside the control, so its border is no longer clipped.
- LAB-1422: Design: Settings tabs, Language, Appearance and the debug chunk size share one native-style segmented control with full-contrast labels; keyboard focus rings the selected segment instead of the whole control, and the grey hint text is darker in light mode.
- LAB-1377: One state machine makes each call's notes, from the transcript to the saved file. When two copies of Audelin share a calls folder, a refresh in one follows the other's retry of an interrupted call, and on quit a running notes request stops before its job is freed for another copy.
- LAB-1365: The extension has install steps, and a nightly live scenario checks that Telemost speakers are named on the panel and in the transcript from the extension's events. A diarization pass that hears no one now keeps the live names instead of erasing them.

## 2026-11-13

- LAB-1364: During a recording Audelin listens for the browser extension and names Telemost speakers live from what the call page shows; with no extension connected they stay unnamed.
- LAB-1374: Audelin pings the browser extension for its clock when it connects and every five seconds after, so browser times can be placed on the call clock; a reconnect starts the clock afresh.
- LAB-1373: The app bundle carries the native host helper, and at launch Audelin points Chrome and Yandex Browser at that copy.
- LAB-1372: Only Audelin's own native host can talk to the app's socket: it presents a secret kept in a file only the user can read, and the app drops any other connection.
- LAB-1371: The app accepts native host connections on its local socket and passes each one's messages to the browser receiver, replacing a socket left by an earlier run.
- LAB-1370: A native host program the browser starts for the Audelin extension relays its messages to the running app over a local socket and the app's replies back.
- LAB-1369: The app reads and writes the framing browsers use to talk to a native host, refusing messages over each direction's size limit.
- LAB-1363: Telemost roster and speaking events become the same call observations Zoom produces, so the speaker-name matcher can use either.
- LAB-1362: The app can register its browser host with Chrome and Yandex Browser, allowing only the Audelin extension, whose ID is now fixed; it repairs its own registration and leaves files it did not write alone.
- LAB-1361: The app can place browser event times on its call clock: the extension answers clock pings, and the app estimates the offset from the quickest recent round trip; times from before the call land at its start.
- LAB-1360: The extension sends call events to the app through its native-messaging host, holding up to 1000 while the app is not reachable and sending them in order once it reconnects.
- LAB-1359: The app accepts extension connections and turns their messages into one stream; a malformed or replayed message closes its connection without affecting others.
- LAB-1358: The extension and the app share one versioned message format for roster and speaking events; the app rejects a message of an unknown version or shape.
- LAB-1357: On a Telemost call page the extension follows the page as it changes and reports roster changes and when each remote participant starts and stops speaking, stamped with the browser clock; it does not reach the app yet.
- LAB-1356: The extension reads which remote participants Telemost marks as speaking; nobody is marked when two tiles share a name.
- LAB-1355: The extension reads who is in a Telemost call, which tile is you, and tells a call page from one that is not.
- LAB-1354: A Chromium extension project for Chrome and Yandex Browser loads on Telemost call pages; it reads nothing yet.
- LAB-1274: Call notes can be made on request even with automatic notes off, cancelled or retried from the calls window, and show when they were made.
- LAB-1347: On first launch the calls window opens wide enough to show a call beside the list.

## 2026-11-12

- The selected call's title and date sit in the toolbar band beside the window controls and stay while its notes scroll below them.
- The calls list reads as a schedule: each row leads with its start time, the duration sits beside the title, rows have no dividers, and the selected row is a quiet tint with an accent bar and time.
- LAB-1262: Open and Rename are grouped over the calls list, with Delete beside them, and are disabled with no call selected; Copy stands alone at the trailing edge over the detail, whose surface runs under the toolbar; search is pinned above the list.
- LAB-1242: The calls window shows the list beside the selected call's notes, Mail-style: the detail follows the selection, Tab moves between them, and its buttons are the row's actions. The eye, «Показать итоги» and the floating summary panel are gone. Below 700 pt the list stands alone and Return or Space opens the call in its own window.
- LAB-1257: The panel keeps an ended call's last rows and its speakers' colours and captions even when they arrive after the recording stops.
- LAB-1132: After a call, the far side is split among its speakers: the transcript labels them `Them 1`, `Them 2`… (or by Zoom name), cleanup and the summary wait for and use them, and the open panel recolours and captions each speaker's rows. The diarization model starts loading when a call opens.

## 2026-11-11

- Renaming a call in the calls list: Return saves the name instead of opening the folder, selecting another row saves it, and the field has room above and below its text.
- LAB-1209: The calls window has a search field (⌘F) that finds a query in call titles, notes and transcripts as you type, ignoring case and ё/е; matches are marked, and each row shows where the first one is with the text around it.
- LAB-1184: Settings General has a working Appearance picker: System, Light or Dark, saved and applied at once to every window, the live panel and the menu bar UI.
- LAB-1220: A right-click on a calls list row selects it before its menu opens, so the menu acts on the selected call; the menu shows each action's key.
- Choosing Settings or Calls from the menu bar brings an already open window to the front, over other apps.
- LAB-1218: Deleting a call moves its folder to the Trash, so it can be put back from Finder; the confirm says so, and a failed move leaves the folder and shows in the calls list.
- The app menu has Settings… (⌘,), titled in the system language.
- LAB-1204: The calls list groups calls by day, newest first, in one-line rows of a fixed height; summary status is an icon, actions are in a context menu, a hover ⋯ button and keys (Return, Space, ⌘R, ⌘⌫), and the window's minimum width is 560 pt.
- The summary preview opens as the active window from the eye, and its text uses the app's type scale, matching the calls list and Settings.
- The About panel shows the build number and commit, a short description, the copyright and a link to the public repository.
- LAB-1180: Settings opens on a General tab with a language picker (System, Русский, English). The menu bar, live panel, Settings, calls list and notes preview switch at once with no relaunch; System follows macOS and falls back to English. Transcription and summaries are unchanged.

- LAB-1177: Retried notes appear in the open calls window and replace an open preview as soon as they finish. Updates also wait for another instance’s retry and unresolved summary ownership.

- LAB-1177: Automatic updates wait for active call summaries to finish. Interrupted summaries can be retried explicitly from the calls list using their saved transcript and settings.

- LAB-1175: Call-notes prompts preserve handoff prerequisites, deadlines and final status, distinguish checking from doing, and request readable action timestamps.
- After a call, Audelin can diarize the call track (Nemotron, falling back to VBx) and give each far-side segment, split where the speaker changes, to its remote speaker; the app does not run it yet (LAB-1131).
- LAB-1164: The calls list shows an eye on calls with notes; it opens a floating preview of the selected call's notes, formatted and copyable, that follows the selection and keeps its place.
- On synthetic Russian group calls of 2–6 speakers over Opus, Nemotron's speaker error is 3.8 % against VBx's 9.2 %; Nemotron stays the after-call diarization default (LAB-1130).

## 2026-11-10

- Calls with microphone bleed get a background transcript cleanup; call notes use the cleaned text when it succeeds and the original text otherwise (LAB-1129).
- LAB-1148: Appending to an existing model name keeps the caret after each character while settings edits are processed asynchronously.
- LAB-1156: Checking unchanged call-notes settings or reverting edits keeps the saved status; actual edits remain available to save.

- LAB-1148: Typing in call-notes settings keeps the caret after the inserted text, including model names.

- LAB-1147: Call notes use Markdown directly, with source times on actions and clearer instructions for corrections, owners and completion states.

## 2026-11-09

- Nightly profiling validates both written tracks and speaker evidence before keeping a baseline, and reports matching-run deltas and descriptive memory/backlog trends for recurring review (LAB-748).

- Call-notes Settings removes repeated service explanations, labels fallback as optional, and groups detailed guidance in a collapsed disclosure (LAB-1114).

- Call-notes fallback is optional; Settings shows whether it is configured, and primary-only calls need no fallback credentials (LAB-1113).

- Settings follows the system’s light or dark appearance throughout the scrolling page (LAB-1108).
- Settings fits the selected page instead of leaving a large blank area below recording controls; longer pages scroll within the screen (LAB-1109).
- Call-notes service pickers show the selected service and native popup arrows for both primary and fallback services (LAB-1111).
- Call notes find Claude automatically in PATH and standard installation folders, including native installs; an absolute path can still select a specific installation (LAB-1110).

## 2026-11-08

- With scroll bars set to always show, the live transcript keeps its newest line in view after the panel is resized (LAB-1084).
- Settings section navigation stays visible while scrolling call notes (LAB-1063).

- Each trunk build is installed on the owner's Mac without interrupting a running Audelin; the new version starts at the next launch or login (LAB-1057).
- Install works from a shell whose temp folder no longer exists (LAB-1056).
- One command installs the app into /Applications, replaces an older copy, opens it and starts it at login (LAB-1054).

## 2026-11-07

- Changing the calls folder confirms the count and size, moves verified copies with progress, and retries the remaining calls after a failure; recordings wait until the move ends (LAB-747).
- Optional call notes can be configured in native Settings and generated after a saved final transcript; Calls displays progress, warnings and failures while recording remains independent (LAB-1034).
- Durable notes follow call rename, deletion and folder moves; pending jobs retain their configuration and interrupted requests are not automatically repeated (LAB-1034).

## 2026-11-05

- Paused transcript reading avoids viewport-changing measurement and empty text edits during panel updates (LAB-1001).
- Drag selection in the nonactivating live panel keeps readable text against macOS's inactive highlight in both appearances. Held excerpts use compact cards with up to three readable lines and full text on hover (LAB-1014).

- The menu hides and restores the live transcript panel without stopping recording or transcription (LAB-1000).

## 2026-11-04

- Calls made in the same minute with different titles get separate ids, so each can be opened, renamed and deleted (LAB-958).
- A call given an empty title gets the bare date and time as its folder name, with no trailing space (LAB-946).
- Audio conversion refuses a zero or non-finite sample rate instead of accepting it (LAB-949).
- Session exposes its complete audio observation state and accepts replaceable failure wording while preserving recording behavior (LAB-951).

## 2026-11-03

- The live panel keeps the newest text visible after later layout growth,
  while paused reading and active text selection stay in place. Delayed scroll
  acknowledgements preserve the reader’s latest position (LAB-942).

- Parakeet omits whitespace-only model words while keeping spoken words' original timing (LAB-943).

- Microphone capture keeps following the default input and checking device availability
  through replaceable native audio calls (LAB-945).

- Streaming transcript text leaves trailing space so the scrollbar does not cover words or the live caret (LAB-934).
- Recorded calls show the duration of tracks kept after a crash, as well as closed tracks (LAB-944).

## 2026-10-30

- Call text keeps an ordered final prefix and merges only the remaining entries;
  a lagging side holds that prefix back until its text catches up or ends (LAB-810).

- Side text retains final entries and their recovered-audio marks, processing only
  newly final entries and the live tail on each hearing (LAB-813).

- Live text reports only newly final segments and its live tail; track text keeps
  final text without mapping it again as the call grows (LAB-815).

- Cancelling a capture stops its timer, recorder and rehearsal and removes the
  recorded media unless kept (LAB-793).

- Capture summaries show the recorded signpost intervals and keep machine data
  separately; terminating endurance also stops its rehearsal (LAB-793).

- Rehearsals capture bounded CPU-and-hangs windows or run endurance without a
  profiler; summaries include named intervals and compare growth (LAB-793).

- The reading reducer keeps call entries in order and rebuilds only changed
  entries when text arrives, reducing work in long calls (LAB-775).

- A long synthetic call can be profiled with one command: the real session
  and panel under Time Profiler, with a summary of the heaviest frames,
  hangs and peak memory (LAB-772).
- The live log redraws only the rows that changed, so an update late in a
  long call costs it about what one early does (LAB-770, LAB-771).

## 2026-10-29

- Live text sends the panel a new state only when the words change, not on
  every audio piece; one side's text failing leaves the other side's going;
  a transcript that keeps failing is reported once; a hearing late in a
  long call costs what an early one does; a word crossing a chunk's edge
  is no longer lost; an entry whose id returns reads as new, and a
  stalled panel finds only the newest text waiting (LAB-753).
- Opening Audelin again shows the transcript panel during a call and the
  calls list between calls (LAB-750).

- Live text breaks long monologues into bounded paragraphs and joins short
  fragments before a pause to the following words (LAB-749).

- The microphone's delivery no longer grows with every buffer until it
  overflowed mid-call or at the call's end, the crash seen on a real call (LAB-751).

- «Звонки…» opens the recorded calls list, with Finder opening, inline title
  editing and confirmed permanent deletion; the active call stays protected (LAB-746).

- The panel shows each recording problem the menu bar shows (no call audio,
  no microphone, disk full, call silent) as a banner, with a gap row in the
  transcript where a track stopped, and opens the matching macOS setting or
  the recordings folder (LAB-739).
- While recording, the menu bar warns when the call side has been silent for
  five minutes while you talk, usually a revoked System Audio Recording
  permission; the warning goes when call audio returns (LAB-733).

- The menu bar names microphone, call-audio and track-write faults while recording
  and ending, keeping each fault until the next recording begins (LAB-510).

- A missing call-audio permission now shows as missing call audio and holds
  recording back, instead of recording a silent call side (LAB-604).

- Capture setup, track and transcript files, recognizer inference, process
  discovery and test fixtures run their blocking work off the cooperative
  pool (LAB-694, #1400); test cleanup, child reaping and audio reads are
  awaited, and TrackFile releases its file on its queue (LAB-734).

- Recording, Session, Reading and Lifecycle keep only their domain: each app
  model comes from swift-imrx, and the hand-written Machine is gone (LAB-694).

## 2026-10-28

- A call's folder is named after the call app, taken from the list that
  detects it (LAB-636).

## 2026-10-27

- Recording opens a floating transcript panel without taking call focus; closing
  and menu reopening keep its saved position and size (LAB-507).

- The panel stays empty until recording begins and gives reused speech IDs
  fresh times and positions even when reading falls behind (LAB-645).

- Each recording feeds its own panel state with call text and elapsed time;
  held selections stay visible while live text prepares again (LAB-507, LAB-641).

- Reading decides the panel's call order, held selections and following,
  keeping prior text when live text is off or fails (LAB-507).

- The menu bar starts and stops recording, saves automatic recording and live
  text choices, and turns red while a recording begins or runs (LAB-509, LAB-464).

## 2026-10-26

- Recording, transcript writes and call-folder creation keep blocking disk
  work off Swift's cooperative thread pool (LAB-593).

## 2026-10-25

- Fill in gets one side's live text ready, recovers its missed written audio,
  and preserves the text so far on abandonment or failure (LAB-554).

- A failed write's automatic capture stop reports its failure immediately,
  once, while Session-requested stops report through shutdown (LAB-553b).

- Compose records both sides through RecordedCapture and reports each side’s
  capture or track failure to the running Session immediately (LAB-553b).

- Recorded capture keeps one capture’s audio on its track while feeding live
  text independently, and reports capture and track failures (LAB-553a).

- Live text receives captured audio without waiting for track writes (LAB-551).

- System audio capture keeps delivering audio through running-0 notices
  at startup (LAB-541).

## 2026-10-24

- Compose translates a recording's captured audio, written tracks and live
  text into call text, and keeps its transcript updates on disk (LAB-535).

- Microphone capture recovers immediately when its input disappears, waits
  through brief missing defaults, and keeps delayed callbacks in time (LAB-532).

- Microphone capture fills every gap up to ten minutes with silence and
  fails on longer gaps, including when the engine has not rebuilt (LAB-532).

- Microphone configuration changes keep using the current input while a new
  default settles; each settled switch uses the input that held (LAB-532).

- Audelin captures the default microphone as mono audio at its device's rate,
  following settled input changes and preserving gaps as silence (LAB-532).

- Each call gets its own folder named by when it is made, with separate
  places for both tracks and the transcript (LAB-524).

- A transcript file keeps the call's latest words as readable Markdown,
  preserving a whole transcript through write failures and app crashes (LAB-508).

- Tracks keep mono audio on disk, append-only, read stretches while
  recording, and keep every returned write after a failure, a crash or a
  full disk (LAB-523).

- Audelin captures the processes it is told, or every process but those
  left out, as mono audio at the device's rate, leaving playback unmuted
  (LAB-471).

- Recording keeps the latest Session's failure reason visible even when
  its end report arrives first (LAB-506).

- Recording now begins and ends Sessions for calls and manual controls, holds
  starts for missing conditions, and keeps failure reasons visible (LAB-506).

- Session keeps pending starts and stops through failures and access loss,
  and follows call text's reported status while settling switches before ending (LAB-506).

- Session now reports runtime piece failures, preserves retained audio and text,
  and closes the Session review gaps (LAB-506).

- Session now brings one recording's folder, tracks, text and captures up
  and down through a tested reducer and effect handler (LAB-506).

## 2026-10-23

- Machines take events in order, run effects independently and tell every
  subscriber each state change (LAB-517).

- Call text switched on after audio ends catches up and includes the final
  words and revisions before finishing (LAB-476).

- Call text reads both sides live, catches up after loading or switching
  on, and keeps earlier text when switched off or when live text fails (LAB-476).

- Audelin can tell which processes to hear for a call app: its own and its
  helpers, the last answer while they are gone, and every process but
  Audelin's before the app appears (LAB-472).
- Recognizers built together share one model load and can retry a failed
  load, avoiding overlapping first-run downloads (LAB-495).

- A process replaced while its microphone flag is read cannot start a call
  under the previous process's app (LAB-473).

- Queued audio notifications cannot report a call for another process that
  reuses the same Core Audio object (LAB-473).

- Core Audio lists audio processes and tells calls in Zoom, Telemost and
  browsers, keeping a call through microphone silences under 30 s (LAB-473).

## 2026-10-22

- Session, automatic recording and timed track are gone, after the owner's
  audit: files are decorators on the captures, when a recording runs waits
  for the app's main shape, and a tap on this Mac leaves no gaps to time
  ([measured](research/system-audio.md#measured-on-this-mac)). Audio
  processes and call watch are one Core Audio wrapper that streams calls
  from Core Audio's own notifications instead of re-reading a list.
- The call's audio has two specs: call app processes picks Amanu's
  processes to tap (the call app and its helpers, else every app but
  Audelin), and system audio capture taps them, keeps call time through
  silence and fails rather than rebuilding. Two Codex challenges
  shaped them.
- Live text no longer settles words at a pause: only the recogniser makes
  words final, within a bounded stretch of audio, and segments are cut
  afresh at each change. Settling at a pause kept a quick reading that a
  better one was about to replace (research run 7b).
- Nemotron makes its last word final once two chunks pass it with nothing
  new: its longest wait for a final word on the real call drops from 31 s
  to 2.7 s, and no final word changed (research run 8).
- A two-pass recogniser shows a fast recogniser's draft and settles a
  better one's final words; with Nemotron drafting and Parakeet final, the
  settled text on the real call is Parakeet's, word for word (run 8).
- Loading the models is now a requirement (S-15, S-16, mvp.md): they load
  at launch, recording never waits, the panel says live text is getting
  ready, and live text catches up. The preview app's first load compiled
  them for about 30 s with nothing on screen (research run 9).
- Prior art for the call's audio (research/system-audio.md): Amanu,
  Muesli, anarlog and AudioCap use a Core Audio process tap; MacParakeet uses
  ScreenCaptureKit because echo cancellation on the mic kills a tap in the
  same process. Audelin's mic is raw, so it takes the tap; the tap's scope
  and start are still open.
- Nemotron 3.5 hears Russian speech as it streams, settling each word when
  the next starts and finishing the remaining audio (LAB-403).
- The Parakeet recogniser is built test-first: Parakeet v3 in Audelin's own
  windows behind Live text's recogniser interface. Replayed through Live
  text, the recorded windows settle every word once. A report now says
  where it starts, so a word the next window no longer hears is gone.
- The Parakeet recogniser's review fixes: a final word stretched past the
  next window no longer freezes the pending words it overlaps, a track
  under 0.3 s finishes, and the model port has its own window-timed word.
- Started over: the architecture decision, every spec and the Swift
  package are removed. The architecture decision is written again from
  scratch, then the specs, then the code.
- CallDomain is gone, with every module built on it (LiveSessionCore,
  CallsCore, Recorder, FileCallStore and their test support) and the app
  target. CallDomain had no job of its own: a call's file format, its
  folder-name rule and an activity gate no feature asked for, in one
  module. Only TranscriptCore remained.
- The capture specs no longer test Core Audio. Mic and system audio
  capture QA drove the hardware (a loopback device, a USB headset, a click
  within 20 ms, levels within 0.5 dB), which proves Apple's framework and
  needs gear the owner does not have. Each adapter is now a thin binding
  plus the translation it owns (host times to the session clock, callbacks
  to faults, Stop), tested through a fake of the binding; the binding is
  proven on a real call. A debug-menu trigger that switches the microphone
  replaced the USB headset.
- The recording session is built in LiveSessionCore, test-first on fakes
  of its ports: capture per track, new calls, recording files, live
  recognition and the session clock. Captured audio is written on the
  capture's own thread and reported to recognition through a stream the
  session never waits on, so Stop is immediate with a stuck recogniser or
  no model. Capture and disk faults are recording-faults', next.
- Agister reviews of the two merged build PRs found five things to fix,
  now fixed test-first: Recorder file names wrapped past 32 bits of
  microseconds (about 36 minutes into a call); a failed copy could delete
  a folder already at the target; deleting the source after a copy used a
  stored path rather than the call's id; the module check missed
  `public import` and `import struct` forms; a stale comment. Tests no
  longer sleep to show that something did not happen, and the Trash tests
  use a disk image's Trash instead of the user's.
- The app exists: `Audelin.app`, a menu bar item with «Выйти», built from
  the package by `macos/scripts/bundle.sh` rather than an Xcode project, so
  CI and the agent build it with `swift build` alone. A module-rule check
  runs in CI; it found LiveSessionCore and CallsCore without
  tests, which they now have.
- Recording to disk is built without the app: the
  activity gate and call folder names (CallDomain), the Recorder and
  FileCallStore, each test-first with every test shown red on its own
  assertion. The Recorder writes Float32 WAV files read by their size and
  writes only through FileCallStore's call-files port.
- The stabilizer is built (TranscriptCore). A
  restart at the watermark with windows shifted by 0.24 s logs no word
  twice and loses none on the recorded fixtures, so the watermark stays. The fixtures showed Parakeet stretching a
  window's last word past the next window's start; such a word now commits
  once no window can read it again.
- The v1 behaviour is specified as 48 SPEC.md and QA.md pairs, one per
  observer; the single v1 spec is gone.
- Terms on clean speech: Parakeet v3 through Audelin's own windows gives
  RACI and OKR only in Cyrillic and SLA in Latin letters half the time, so
  live terms are out of v1 and the live engine is revisited before v2
  ([tests.md](research/tests.md) run 5). Its replies are the stabilizer's
  fixtures.

## 2026-10-21

- v1 records calls on its own: recording starts when a call starts and
  stops when it ends; live text can be switched off, so Audelin replaces
  Amanu.
- ADR-001: v1 is one modular app; it records first, runs one live stream per
  track, and logs only through decorators in the composition root.
- Name: Audelin, in Russian Одели́н; CLI `audelin`, data in `~/.audelin`.
- Design: Glass Ledger visual language and Screens 1–8, light and dark.
- Versions planned: v1 live transcript, v2 term explanation through bb, v3
  final pass and summary.
- Spike: Parakeet v3 through FluidAudio's sliding window works live with 4 s
  chunks; English terms came out in Cyrillic or wrong, which is still to be
  tested on clean speech. Two live streams at once (mic and call audio) cost
  almost nothing.
- Tried existing apps on real Zoom calls: Superwhisper, Amanu, MacParakeet
  and MacWhisper. None combined a smooth, selectable live transcript with
  explaining a selected term, so we decided to build our own native macOS
  app instead of forking one.
