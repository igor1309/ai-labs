---
date: 2026-10-27
model: claude-opus-5-5
description: "Mizan BLE — how it is built: choosing the host by signal strength and encrypting each exchange with a per-session key"
---

# Mizan BLE — notes

## Decided

### Roles

- The host (iPad) is the BLE peripheral: it advertises one Mizan service
  and serves its characteristics. The client (iPhone) is the central: it
  scans, connects and reads, writes and subscribes. These are the roles
  Sber's «Вжух» uses between a phone and a till
  ([research/vzhuh.md](docs/research/vzhuh.md)).

### Choosing the host by signal strength

When more than one host is in range, the client takes the nearest one
rather than the first it hears, so a payment never goes to the till next
door.

- **Scan:** filtered by the Mizan service UUID, with
  `CBCentralManagerScanOptionAllowDuplicatesKey` on, so each advertisement
  brings a fresh RSSI. That option works only in the foreground, which is
  where v0.0.1 runs anyway. A reading of 127 means "not available" and is
  dropped.
- **Smoothing:** an exponential moving average per host,
  `ema = α·rssi + (1 − α)·ema`, with α = 0.3 to start (the value in Sber's
  patent example). A host not heard for 2 s leaves the candidate list.
- **Decision:** after a window of at least 1 s and 5 readings for the
  leader, the client takes the host with the strongest average if it is
  above a floor and leads the runner-up by a margin. Starting values: floor
  −65 dBm, margin 6 dB. With no clear leader the client keeps scanning and
  shows "Hold your phone closer to the till"; it never guesses.
- **Settings:** α, the window, the floor and the margin are settings, like
  the host's countdown. Starting values are guesses; the values measured
  between a real iPad and iPhone are recorded here.
- **Seam:** the selector is a pure type that takes timestamped readings and
  a clock and returns a host, "keep scanning" or nothing; Core Bluetooth
  only feeds it. Its tests cover one host, two close hosts, a host that
  fades out and the 127 reading, with no radio.

### Encrypting the exchange with a per-session key

The amount, the client's decision and the host's result never cross the
air in the clear, and a message from one transaction is useless in
another.

- **Keys:** each transaction makes a fresh P-256 key pair on both sides
  (CryptoKit `P256.KeyAgreement`), and a random 16-byte session id on the
  host. Nothing is kept after the transaction ends.
- **Handshake:** the client reads the host's public key and session id
  from one characteristic and writes its own public key to another. Both
  sides run ECDH and derive a 256-bit key with HKDF-SHA256 (salt: the
  session id; info: `mizan-ble v1`).
- **Messages:** every message after the handshake (the amount, confirm or
  decline, the acknowledgement, the result) is sealed with AES-GCM. The
  authenticated data is the session id, the message type and a counter per
  direction; a receiver rejects a wrong session, a counter it has seen and
  anything after the countdown ends.
- **Not JWE:** «Вжух» wraps its payload in JWE because the phone and the
  till are built by different teams. Both ends here are ours, so CryptoKit
  alone does it, with no JOSE library.
- **Size:** a compressed key is 33 bytes and the AES-GCM overhead 28, so
  every message fits one write. Before writing, the client checks
  `maximumWriteValueLength(for:)` and fails the transaction on a message
  that does not fit, rather than fragmenting.
- **Seam:** sealing, opening and the counter check live in one type with
  no Core Bluetooth in it, tested for a round trip, a tampered message, a
  replay, a wrong session and an expired one.

## Open

- **When they land.** Suggested: both in v0.0.1. They shape the GATT
  characteristics and the state machines, which is cheaper to design once
  than to retrofit, and neither is much code. The owner decides when v0.0.1
  is planned.
- **Is it really the till?** Any device can advertise as a host. The
  per-session key keeps out a passive listener, not a fake till. A cheap
  check for a later version: both screens show the same 4 digits derived
  from the shared key, as Bluetooth pairing does with numeric comparison.
  Something stronger, such as hosts holding keys the client trusts, needs a
  backend and belongs past the proof of concept.
