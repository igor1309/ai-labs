# Mizan BLE

A proof of concept for paying in Mizan between two iOS devices over
Bluetooth Low Energy. One app has two modes: the host (an iPad at the
till) enters an amount and advertises it; the client (an iPhone) finds the
host, shows the amount, and confirms or declines. The host then shows a
mocked payment result, and both sides end the transaction.

Status: building v0.0.1 (2026-10-27). The design system module is in the
Swift package under `ios/`; the app is not built yet. v0.0.1 is the two-mode
app with both apps in the foreground; later versions try to drop the
explicit handshake (v0.1.0) and the foreground app (v0.2.0).

| Path | What it holds |
|---|---|
| [docs/poc.md](docs/poc.md) | The proof of concept: versions, the host and client flows, design notes, research leads |
| [NOTES.md](NOTES.md) | How it is built: choosing the host by signal strength, encrypting each exchange with a per-session key |
| [ios/](ios/) | The Swift package: the `DesignSystem` module so far. `swift test` runs its tests |
| [docs/design/](docs/design/) | The design in pen.dev (`mizan-ble.pen`) and its previews: the design system, the host and client screens and the paired flow, and the Mizan sign candidates |
| [docs/research/](docs/research/) | Research notes on proximity payments, including an architecture proposal candidate for discussion |
| [docs/log.md](docs/log.md) | What changed for the product, newest first |

Each mode has its own colour, orange for the host and cyan for the
client, and the mode switch sits in every header. The Mizan sign is a
turned M with a tail and two bars.
