# Client connect — QA

Driven through its reducer as tables, and through the machine with fakes
of the link (with a chosen largest write), the session and the deadline.
Rows read the state and what the fakes recorded.

## S-1 Connecting

Built for MIZAN-7F3A: the link fake asked to connect; the state reads connecting to MIZAN-7F3A, cancel offered. Evidence: Missing.

## S-2 The link is secure

Connected, the link fake gives a session, the key written, the session fake derives and opens 124.50: the state reads handed over with 124.50. Evidence: Missing.

## S-3 The link drops during the handshake

Connecting, link dropped: the session closed; the state reads could not connect, try again offered. Evidence: Missing.

## S-4 The host's session does not agree

Connecting, the session fake refuses the host's session: the link dropped, the session closed; the state reads could not connect. Evidence: Missing.

## S-5 The handshake takes too long

Connecting, the deadline fake fires at 10 s: the link dropped; the state reads could not connect. Evidence: Missing.

## S-6 The key does not fit one write

Connected with a largest write of 20 and a 33-byte key: nothing written, the link dropped; the state reads could not connect. Evidence: Missing.

## S-7 The connection cannot be set up

Connecting, the link fake reports could not connect, no service: the session closed; the state reads could not connect, try again offered. Evidence: Missing.

## S-8 The host refuses the key

Connected, the link fake answers the key write with an ATT error: the link dropped, the session closed; the state reads could not connect. Evidence: Missing.

## S-9 The payer cancels

Connecting, cancel: the link dropped, the session closed; the state reads over. Evidence: Missing.

## S-10 Trying again

Could not connect, try again: the state reads over. Evidence: Missing.
