# Mizan BLE

A proof of concept for paying in Mizan between two iOS devices over
Bluetooth Low Energy. One app has two modes: the host (an iPad at the
till) enters an amount and advertises it; the client (an iPhone) finds the
host, shows the amount, and confirms or declines. The host then shows a
mocked payment result, and both sides end the transaction.

Status: building v0.0.1 (2026-10-29). The app shell launches with the mode
switch and logs; host and client screens await flow wiring. v0.0.1 is the two-mode
app with both apps in the foreground; later versions try to drop the
explicit handshake (v0.1.0) and the foreground app (v0.2.0).

| Path | What it holds |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app is built: grounding rules, components and modules, the GATT layout, settings |
| [docs/spec/](docs/spec/) | What it does: the user's spec, and one `SPEC.md` and `QA.md` per component |
| [AGENTS.md](AGENTS.md) | Rules for agents: the architecture, the spec process, building and the design |
| [docs/poc.md](docs/poc.md) | The proof of concept: versions, the host and client flows, design notes, research leads |
| [NOTES.md](NOTES.md) | How it is built: choosing the host by signal strength, encrypting each exchange with a per-session key |
| [ios/](ios/) | The component Swift package and the root package `App/` (`Root`, `DeviceRadios` and the MizanBLE app target): the cores `HostBroadcast` (a locked amount through the countdown and handshake to a secure link), `HostPayment` (the client's decision through the mock result), `ClientFind` (scanning, host selection and handover), `ClientConnect` (the handshake from a chosen host to a secure link and the amount), `ClientReview` (the payer's confirm or decline through the host's acknowledgement) and `ClientPayment` (the payer's wait for the host's result and the transaction's end), `DesignSystem`, `HostRadio` (serving and advertising sessions, the owner's writes and queued sends, and service cleanup), `ClientRadio` (Bluetooth readings, GATT connections, writes and host messages), `Preferences` (numbers and text stored in a named suite), `SystemClock` (monotonic instants, countdowns and periodic ticks), and the UI modules `ModeSwitchUI` (the mode and its header switch), `HostUI` (the operator's iPad screens), `SettingsUI` (the host's settings sheet), `ClientUI` (the payer's find and connect screens) and `ClientPaymentUI` (the payer's review and result screens). Each core's effect handler returns its results as a stream, for the app to run on swift-imrx's `ObservableModel`. Run `swift build` and `swift test` here |
| [ios/PreviewApps/](ios/PreviewApps/) | `ModeSwitchPreview`: try the switch in either device shell; `HostPreview`, `SettingsPreview`, `ClientPreview` and `ClientPaymentPreview`: pick the module's states and log the events they send. Each exports light/dark PNGs |
| [docs/design/](docs/design/) | The design in pen.dev (`mizan-ble.pen`), its index and previews: the design system, the host and client screens and the paired flow, and the Mizan sign candidates |
| [docs/research/](docs/research/) | Research notes on proximity payments, including an architecture candidate the architecture weighs |
| [docs/log.md](docs/log.md) | What changed for the product, newest first |

Each mode has its own colour, orange for the host and cyan for the
client, and the mode switch sits in every header. The Mizan sign is a
turned M with a tail and two bars.

Generate the app project by running `xcodegen` in `ios/App`. From the
repository root, build the unsigned simulator app with:

```sh
xcodebuild -project mizan-ble/ios/App/MizanBLE.xcodeproj -scheme MizanBLE -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Open `ios/App/MizanBLE.xcodeproj` in Xcode, select the MizanBLE scheme and
an iPhone or iPad simulator, and run. iPad launches Host; iPhone launches
Client. To run on a device, select your signing team and enable signing
in the target settings. The shell keeps both radios idle until flows
are wired. Test the root with `swift test` in `ios/App`; regenerate the
icon from `DesignSystem` with `swift run RenderAppIcon` there.

Run the `MizanBLE Rehearsal` scheme on a simulator to play against a
scripted other side. Add `-scriptedRadio /absolute/path/to/settings.json`
to the scheme's launch arguments, or put `scripted-radio.json` in the
app container's Documents directory. The JSON format and scenario examples
are in [Rehearsal](ios/App/Rehearsal/README.md). File changes take effect
without relaunching; each transaction keeps its starting settings. The
rehearsal currently exposes the shell, with flow wiring still to come.
