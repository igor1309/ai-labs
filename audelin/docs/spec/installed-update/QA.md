# Installed update — QA

Each row describes a drive and required read-back evidence, not a verdict.
Evidence is Missing until a run report supplies it. No update rehearsal is
implemented by this spec-only change.

## Rehearsal boundary

A dedicated update rehearsal should render the actual menu bar item and menu,
with controls for installed builds, recording, and a held final transcript save.
It must let the operator complete another install while an offer is pending,
start another call, and release final saving independently of stopping recording.
Use distinguishable running and installed builds and an ordinary-launch baseline
with the same calls and pending notes. Record visible results, not just sent actions.

Controlled inputs prove presentation and gating; a simulated relaunch cannot prove
bundle replacement, process exit, installed-build launch, elapsed detection time,
recorded audio preservation, or durable note recovery. Those require disposable
signed app copies and call data on this Mac, plus a real call through Audelin.
Never replace the owner's installed copy or use the owner's call store for QA.
Observe the launched build through its user-visible build identity; a restart
callback alone does not prove the new build opened.

Repeat presentation drives in light and dark. Compare the idle glyph and recording
time with Screen 7b, including the badge corner and unchanged item bounds and
neighbour positions. Read menu text and enabled state from the rendered UI;
check disabled activation by mouse and keyboard and active restart by each input.
Check the restart offer has no keyboard shortcut. Colour, copy, spacing and menu
placement are visual comparisons to the approved design, not new spec decisions.

| Scenario | Drive and evidence required | Evidence |
| --- | --- | --- |
| S-1 No installed update | Launch the installed build; capture the menu bar and open menu with neither badge nor restart offer, matching the no-update design. | Missing |
| S-2 Reinstall the running build | Reinstall that build into the disposable app location; await the completed detection observation, then capture the unchanged icon and menu. A sleep followed by no callback is insufficient. | Missing |
| S-3 Notice an installed update | Complete a newer install between calls; timestamp install completion and the first visible badge and enabled offer. Report the elapsed seconds, with screenshots; a fake notification alone cannot prove detection latency. | Missing |
| S-4 Keep the menu bar in place | With the idle glyph showing, make the update available; compare before/after screenshots and measured item and neighbour bounds, reading the badge at the corner. | Missing |
| S-5 Notice an update during recording | On a real call, complete a newer install; timestamp completion and visible badge, capture the recording time and unchanged bounds, then play back both sides and read the final words after the call. | Missing |
| S-6 Cannot restart during recording | Hold recording with an update pending; open the menu and attempt the disabled offer with mouse and keyboard. Capture its reason and continued live recording; play back audio spanning the attempt. | Missing |
| S-7 Cannot restart while saving the final transcript | Stop recording but hold the latest final save; capture the disabled offer and reason, try activation, and confirm the same running app still shows the call. Release saving separately. | Missing |
| S-8 Restart becomes available after the call | Starting from the disabled offer, stop recording and release final saving; inspect the now-enabled offer and retained badge without relaunching. Read back the saved final words. | Missing |
| S-9 A new call prevents restart | Start another call after the offer was enabled, then attempt restart; capture the disabled offer and reason and play back uninterrupted audio around the attempt. Also drive a call starting as restart is requested and require that the recording is never cut short. | Missing |
| S-10 The offer stays until restart | Dismiss and reopen the menu between calls, during recording, and while final saving is held; capture the retained badge and correctly gated offer in each case. | Missing |
| S-11 Restart into the installed build | With no call in progress, choose the offer; record old-process exit and the reopened app's visible newer build identity, badge-free icon and menu without the offer. Repeat with keyboard navigation. | Missing |
| S-12 A later install is the restart destination | Install a newer build, then an even newer distinguishable build before restarting; capture the retained offer, restart, and read the newest build identity. Repeat with both installs during recording, proving gating and intact final audio/text before restarting. | Missing |
| S-13 Restart retains normal launch recovery | Seed disposable calls and pending notes, restart through the update offer, and compare visible calls, transcripts and note progress with an ordinary launch from identical saved data. Read resulting note content when the controlled provider completes; apply the existing ordinary-launch recovery rules. | Missing |

The parent's “within seconds” is the latency oracle; no numeric cutoff is
invented here. Preserve measured elapsed time in the run report for acceptance.
Platform research and architecture must settle any additional observable failure
behaviour before implementation; this spec does not invent failure UI absent
from the approved oracle.

## Automatic update during notes

`cd audelin/macos/App && swift test --filter SummaryCompositionTests` holds local generation and an external owner's terminal save. Update requests are refused until saving finishes, then relaunch is allowed. Coordinator and job protection checks hold the asynchronous handoff and terminal write independently. Observer arbitration cases cover another instance's explicit retry and unavailable completion evidence.
