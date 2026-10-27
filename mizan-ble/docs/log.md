# Log

## 2026-10-27

- Decided: the client picks the nearest host by smoothed signal strength and
  never guesses between two close ones, and every message after the
  handshake is encrypted with a key made for that one transaction.
- Research: Sber's «Вжух» pays over BLE with the iPhone as central and the
  terminal as peripheral, choosing the nearest terminal by smoothed RSSI and
  sending an encrypted token in GATT fragments; the terminal goes online, so
  the phone need not. The same roles fit mizan-ble's client and host
  (LAB-623).
- Project started: a two-mode iOS app, an iPad host and an iPhone client,
  that agree a Mizan payment over Bluetooth LE. v0.0.1 is planned with both
  apps in the foreground and a mocked payment; v0.1.0 and v0.2.0 are to find
  how far iOS lets the handshake and the foreground app go.
