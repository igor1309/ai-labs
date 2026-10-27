# Mizan BLE

A proof of concept for paying in Mizan between two iOS devices over
Bluetooth Low Energy. One app has two modes: the host (an iPad at the
till) enters an amount and advertises it; the client (an iPhone) finds the
host, shows the amount, and confirms or declines. The host then shows a
mocked payment result, and both sides end the transaction.

Status: planning (2026-10-27). No app code yet. v0.0.1 is the two-mode
app with both apps in the foreground; later versions try to drop the
explicit handshake (v0.1.0) and the foreground app (v0.2.0).

| Path | What it holds |
|---|---|
| [docs/poc.md](docs/poc.md) | The proof of concept: versions, the host and client flows, design notes, research leads |
| [NOTES.md](NOTES.md) | How it is built: choosing the host by signal strength, encrypting each exchange with a per-session key |
| [docs/research/](docs/research/) | Research notes: how existing proximity payments work (Sber's «Вжух» so far) |
| [docs/log.md](docs/log.md) | What changed for the product, newest first |

The Mizan currency symbol comes from the blackchain project in the
[cortagora](https://github.com/igor1309/cortagora) repo.
