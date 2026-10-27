# Mizan BLE

A proof of concept for paying in Mizan between two iOS devices over
Bluetooth Low Energy. One app has two modes: the host (an iPad at the
till) enters an amount and advertises it; the client (an iPhone) finds the
host, shows the amount, and confirms or declines. The host then shows a
mocked payment result, and both sides end the transaction.

Status: building v0.0.1 (2026-10-27). The architecture and every
component's spec are written; the design system and mode-switch UI are in the Swift
package under `ios/`, and the app is not built yet. v0.0.1 is the two-mode
app with both apps in the foreground; later versions try to drop the
explicit handshake (v0.1.0) and the foreground app (v0.2.0).

| Path | What it holds |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app is built: grounding rules, components and modules, the GATT layout, settings |
| [docs/spec/](docs/spec/) | What it does: the user's spec, and one `SPEC.md` and `QA.md` per component |
| [AGENTS.md](AGENTS.md) | Rules for agents: the architecture, the spec process, building and the design |
| [docs/poc.md](docs/poc.md) | The proof of concept: versions, the host and client flows, design notes, research leads |
| [NOTES.md](NOTES.md) | How it is built: choosing the host by signal strength, encrypting each exchange with a per-session key |
| [ios/](ios/) | The Swift package: `DesignSystem`, and the UI modules `ModeSwitchUI` (the mode and its header switch), `HostUI` (the operator's iPad screens), `SettingsUI` (the host's settings sheet) and `ClientUI` (the payer's find and connect screens). Run `swift build` and `swift test` here |
| [ios/PreviewApps/](ios/PreviewApps/) | `ModeSwitchPreview`: try the switch in either device shell; `HostPreview` and `SettingsPreview`: pick the module's states and log the events they send. Each exports light/dark PNGs |
| [docs/design/](docs/design/) | The design in pen.dev (`mizan-ble.pen`), its index and previews: the design system, the host and client screens and the paired flow, and the Mizan sign candidates |
| [docs/research/](docs/research/) | Research notes on proximity payments, including an architecture candidate the architecture weighs |
| [docs/log.md](docs/log.md) | What changed for the product, newest first |

Each mode has its own colour, orange for the host and cyan for the
client, and the mode switch sits in every header. The Mizan sign is a
turned M with a tail and two bars.
