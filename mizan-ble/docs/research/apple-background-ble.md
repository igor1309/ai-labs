# Apple BLE without opening the app

Research checked: 27 October 2026. Method: desk research of Apple documentation, including the current Markdown documentation endpoints and the restoration technote. No device experiments were performed. This is a platform-capability note, not a product recommendation, implementation specification, security audit or evidence of App Review approval.

## Findings

An iPhone app does not have to display its screen to discover a BLE peripheral, connect, or exchange GATT data. Apple explicitly supports event-driven background Core Bluetooth. The qualifications are how the session starts, what scan data is delivered, whether the process survives, and which system event can restart it.

A process launched by an App Intent without opening a screen is still executing app code in the background. “No app screen”, “suspended app”, “terminated app”, “force-quit app” and “no previously configured session” are different requirements. The documentation does not establish a general mechanism that starts an arbitrary Mizan BLE payment solely because an unknown till comes near an iPhone.

Two documented capabilities must not be conflated: iOS 26 grants enhanced Bluetooth privileges to an app that creates a Bluetooth manager and starts a Live Activity before backgrounding; a LiveActivityIntent can start a Live Activity without opening the app. Apple does not explicitly document that combining them from a cold background launch grants those Bluetooth privileges. That combination remains unverified.

v0.0.1 deliberately uses both apps in the foreground. These findings neither require that restriction for all future versions nor change that version's scope.

## Capability and evidence matrix

“Documented” means Apple's text describes the capability, not that Mizan has demonstrated it.

| Situation | Evidence and limitation | Status |
|---|---|---|
| Client screen hidden; discovery, connection and GATT | Declare `bluetooth-central`; background scans are constrained and events wake the app | Documented [1] |
| Host screen hidden; GATT and advertising | Declare `bluetooth-peripheral`; advertising changes and read/write/subscription events can wake it | Documented [1] |
| Suspended process with a configured Bluetooth operation | The system activates it for relevant events; this is not perpetual execution | Documented [1, 2] |
| System removed process from memory or app crashed | Restoration table says relaunch is supported; pending work and matching event are required | Documented, conditional [2] |
| User force-quit | Table says no, qualified by note 5 for AccessorySetupKit from iOS/iPadOS 26 | Documented qualification, not a generic peer-app guarantee [2] |
| Active Live Activity after foreground setup | iOS 26 adds foreground-like Bluetooth privileges, explicitly including unfiltered and duplicate discovery scans | Documented [3] |
| User starts a Live Activity from Control Center without opening app UI | LiveActivityIntent can launch the app process and start the activity | Documented [4, 5] |
| Intent cold launch → Live Activity → enhanced BLE scan | Sources document each feature separately, not this lifecycle combination | Inference; untested |
| Nearby accessory automatically causes system pairing UI | EU iPhone, iOS 26.5+, registered/self-certified accessory and program access | Documented accessory program; applicability to an iPad till unestablished [7] |

## Ordinary background Core Bluetooth

The client declares `bluetooth-central` in `UIBackgroundModes`; the host declares `bluetooth-peripheral`. Both roles may be declared if needed. Bluetooth privacy usage descriptions and user authorization remain necessary. Declaring these modes allows Bluetooth-related execution; it does not grant an unrestricted background service. [1, 3]

For a central, Apple documents background discovery, connection, service exploration and interaction with peripheral data. Duplicate discovery events are coalesced and the allow-duplicates scan option is ignored in ordinary background mode. Scan intervals increase when all scanning apps are backgrounded. A foreground RSSI sampling algorithm cannot assume an identical background sample stream or discovery latency. [1]

For a peripheral, read, write and subscription requests can wake the app. Background advertising omits the local name and moves advertised service UUIDs into an overflow area discoverable by iOS devices explicitly scanning for those UUIDs. Advertising frequency may decrease when all advertising apps are backgrounded. The host's displayed identity cannot depend on an advertised local name always being delivered. [1]

Apple's guide describes brief event handling, approximately ten seconds after wake, and user-controlled start/stop sessions. It also describes long-lived pending connections, including automatic reconnection to a door lock when the user returns. This is evidence that unattended BLE interaction is supported for configured relationships; it does not prove reliable discovery and payment at an arbitrary new till. The guide is archived, so the newer Live Activity exception below must be considered separately. [1, 3]

## Restoration and force-quit: exact scope

State preservation/restoration is opt-in; it is not equivalent to permission to use Bluetooth. The app supplies restoration identifiers and reconstructs managers and application state when relaunched. A specific pending operation and its corresponding event are necessary. Apple's examples include scanning, connecting, subscribed characteristic notifications and peripheral advertising. [1, 2]

TN3115's table distinguishes:

- Suspended in memory: activated without a relaunch.
- Removed from memory or crashed: relaunch listed as supported.
- User force-quit: no, with note 5 attached.
- Bluetooth power toggled in Settings: no.
- Control Center Bluetooth toggled: yes, with note 5 attached.
- Airplane Mode toggled: conditional on Bluetooth not being toggled, also subject to note 5.
- Device restarted: yes, after the first unlock if a passcode is required. [2]

Note 5 limits relaunch to apps using AccessorySetupKit to set up Bluetooth accessories starting with iOS/iPadOS 26. Its placement qualifies particular table rows. Do not paraphrase it as either “all restoration now requires AccessorySetupKit” or “force-quit always works after accessory setup.” The table retains a negative force-quit entry with a qualification; the precise eligible accessory behavior needs device verification. [2]

AccessorySetupKit is a hardware-accessory setup framework. Apple directs app-to-app pairing to DeviceDiscoveryUI, which supports Apple and third-party devices and peer-to-peer networks. Consequently, AccessorySetupKit's presence in TN3115 is not evidence that two ordinary Mizan apps can obtain accessory relaunch behavior. No such eligibility was established in this research. [6]

## Live Activities and App Intents

### Already-started session: documented iOS 26 exception

The current Core Bluetooth overview says that an app with an instantiated `CBManager` that starts a Live Activity before entering the background can retain the same Bluetooth privileges there. It specifically names scans without service UUID filters and scans with duplicate filtering disabled. Thus, a blanket statement that iOS background BLE can never supply repeated discovery/RSSI events is incorrect. [3]

This statement does not specify scan latency, sampling rate, survival after termination or behavior after the activity ends. A Live Activity is finite and user-controlled: ActivityKit documents an active lifetime of up to eight hours, with possible earlier ending. The Live Activity UI has its own sandbox; the app process performs Bluetooth work. A visible activity is not evidence that the app process is continuously executing. [3, 5]

### Starting without opening the screen: documented, but distinct

Apple documents a Control Center control invoking `LiveActivityIntent`. Its `perform()` can start a Live Activity while the app is backgrounded, and the system launches the app process without opening the app UI. General App Intents can run in the app or extensions, depending on placement and execution context; not all intents share identical runtime behavior. [4, 5, 8]

The current general runtime page describes foreground defaults for some intent protocols, including LiveActivityIntent, while the protocol and ActivityKit pages explicitly describe the no-screen-launch case. This note relies on the specific documented example for that case and does not assume every invocation surface, SDK or configuration behaves identically. Exact deployment availability and runtime settings must be checked against the SDK used for an implementation. [4, 5, 8]

The proposed chain “system control → background process → instantiate manager → start Live Activity → duplicate BLE scanning → confirm through system UI” is not demonstrated by these sources. In particular, the Bluetooth wording assumes an activity started before backgrounding; an intent-launched process might never have been foregrounded. Neither API's existence resolves that difference. The chain is a research question, not a finding of feasibility. [3–5]

## Proximity-triggered UI and alternative entry points

### BLE accessory pairing

Apple's current program page describes automatic pairing prompts triggered by an accessory's BLE advertisement. Availability is EU iPhone on iOS 26.5 or later. Access requires an organization developer membership, program agreement, branded accessories for EU customers, registration and accessory self-certification. A companion app is required. This is evidence for proximity-triggered system UI for eligible accessories, not a public API for arbitrary payment prompts or automatic authorization. Nothing checked here establishes that a software-only iPad till qualifies. [7]

### NFC without manually opening an app

Background NFC tag reading on iPhone XS and later can detect a supported tag while the phone is in use and display a notification. Tapping delivers the tag to the associated app, with unlock when needed. This avoids manually finding the app but still involves a user action and may open UI. It is not BLE or invisible execution. An App Clip invocation likewise provides a system-mediated entry into an experience rather than proving unrestricted background Bluetooth. [9, 10]

For the separate NFC & SE payment platform, Apple documents that a configured default contactless app can be launched by a side/Home-button gesture. Transaction initiation requires foreground app execution and an unlocked phone, with user authorization. This route has its own eligibility, agreements and entitlement; it is not a BLE transport privilege. [11]

## What remains unproven

This desk research establishes platform mechanisms, not a working no-screen Mizan payment. Before claiming that experience is supported, collect physical-device evidence for:

1. Foreground-created manager/activity versus an intent-created manager/activity with no foreground transition; service-filtered and duplicate scans measured separately.
2. App screen hidden, device locked/unlocked, process suspended, system termination, force-quit and restart after first unlock. Record the exact iOS build, SDK and permissions.
3. Live Activity disabled, dismissed or ended; Bluetooth/permission changes; low-power operation. Record discovery delay and actual RSSI event cadence rather than assuming foreground behavior.
4. Connect, discover, subscribe, exchange session messages, timeout and disconnect recovery on an iPad host and iPhone client. Keep host and client lifecycle results separate.
5. An installed app with prior setup versus no configured Bluetooth work. An event that restores pending work is not a first-time launch guarantee.
6. Explicit confirmation and authentication from the intended system surface, including lock-state restrictions. Successful BLE exchange proves neither payment authorization nor settlement.

No tests above have been run for this note. There is no finding that arbitrary arrival-triggered, app-free Mizan payment is impossible; equally, the sources do not prove it feasible. Documented background BLE and no-screen user invocation are narrower, defensible findings.

## Primary sources

All accessed 2026-10-27. The current framework/API pages were checked alongside the archived programming guide; no third-party summaries are used as capability evidence. Dynamic availability and program requirements must be rechecked before implementation.

1. [Core Bluetooth background processing guide](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html) — background roles, scan/advertising differences, short event handling, preservation and restoration.
2. [TN3115: Bluetooth State Restoration app relaunch rules](https://developer.apple.com/documentation/technotes/tn3115-bluetooth-state-restoration-app-relaunch-rules) — state table and note 5; revision dated 2025-09-15. The Markdown endpoint exposes the complete table and footnotes.
3. [Core Bluetooth overview](https://developer.apple.com/documentation/corebluetooth) — iOS 26 Live Activity exception and Bluetooth privacy requirements.
4. [LiveActivityIntent](https://developer.apple.com/documentation/appintents/liveactivityintent) — app-process launch without opening app UI; Control Center example.
5. [Displaying live data with Live Activities](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities) — background intent start, activity lifetime and sandbox.
6. [DeviceDiscoveryUI](https://developer.apple.com/documentation/devicediscoveryui) and [AccessorySetupKit](https://developer.apple.com/documentation/accessorysetupkit) — app-to-app pairing versus hardware accessory setup.
7. [Proximity-triggered pairing in the European Union](https://developer.apple.com/proximity-pairing) — iOS 26.5 availability, accessory certification and access requirements.
8. [Configuring the runtime behavior of your app intents](https://developer.apple.com/documentation/appintents/configuring-the-runtime-behavior-of-your-app-intents) — execution location, modes and system choice.
9. [Adding support for background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading) — supported iPhones, notification tap and unlock.
10. [Configuring the launch experience of your App Clip](https://developer.apple.com/documentation/appclip/configuring-the-launch-experience-of-your-app-clip) — invocation mechanisms.
11. [NFC & SE Platform security](https://support.apple.com/guide/security/nfc-se-platform-security-secda20f3f41/web) — authorization, foreground execution and default contactless app launch.
