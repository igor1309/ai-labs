# Log

## 2026-10-27

- The rest of the design system in the module: named type roles, the
  status pill, the host rail and client stepper, device chips, messages and
  the exchange strip, keypad keys, and the iPad and iPhone screen shells
  (LAB-634).
- A light appearance: every design system colour has a light value, and
  the app's components follow the device's light or dark setting (LAB-633).
- The design system module: the design's tokens, generated from a snapshot
  of the design file, the bundled fonts, the Mizan sign, and the buttons,
  amount, countdown, mode header and result card the screens are built
  from (LAB-627).
- Design: the design system is locked, with host orange and client blue and
  the mode switch in every header; paired host and client frames cover the
  flow; the Mizan sign is a turned M with a tail and two bars; earlier
  designs moved to an Explorations area (LAB-612, LAB-613, LAB-614).
- Decided: the client picks the nearest host by smoothed signal strength and
  never guesses between two close ones, and every message after the
  handshake is encrypted with a key made for that one transaction. Both
  are in v0.0.1; a 4-digit match against fake tills comes later.
- Research: Sber's «Вжух» pays over BLE with the iPhone as central and the
  terminal as peripheral, choosing the nearest terminal by smoothed RSSI and
  sending an encrypted token in GATT fragments; the terminal goes online, so
  the phone need not. The same roles fit mizan-ble's client and host
  (LAB-623).
- Project started: a two-mode iOS app, an iPad host and an iPhone client,
  that agree a Mizan payment over Bluetooth LE. v0.0.1 is planned with both
  apps in the foreground and a mocked payment; v0.1.0 and v0.2.0 are to find
  how far iOS lets the handshake and the foreground app go.
