# Host broadcast — QA

Driven through its reducer as tables of event in, state and effect out,
and through the machine with fakes of the session, advertiser, sender,
countdown and setting. The fakes record what was served, advertised, sent,
retired and closed; rows read that record and the state.

## S-1 Locking starts the broadcast

124.50 locked with the setting at 30: the advertiser fake serves a session and advertises; the state reads advertised with 30 left. Evidence: Missing.

## S-2 The host cannot go on air

Locked, the advertiser fake reports it could not go on air: the state reads the error and 124.50 not locked; the session fake closed. Evidence: Missing.

## S-3 The countdown ends with no secure link

Locked, the countdown fake reaches zero: advertising stopped, the service retired, the session closed; the state reads timed out with an empty amount. Evidence: Missing.

## S-4 Cancel while advertising

Locked, cancel: advertising stopped, the service retired; the state reads 124.50 not locked. Evidence: Missing.

## S-5 A client starts the handshake

Locked, a client key event with 22 s left: advertising stopped, the service kept; the state reads handshake with 22 left. Evidence: Missing.

## S-6 The link is secure

A key, the session fake derives, the sender fake records the amount: the state reads handed over, the countdown fake stopped. Evidence: Missing.

## S-7 The client's key does not agree

A key the session fake refuses: the state reads failed with both choices; the session closed, the service retired. Evidence: Missing.

## S-8 The link drops during the handshake

A key, then link lost: the state reads failed with both choices; the session closed. Evidence: Missing.

## S-9 The amount cannot be sent

A key, derived, the sender fake fails: the state reads failed with both choices; the session closed. Evidence: Missing.

## S-10 Broadcast again

Failed, broadcast again: a second, different session served and advertised with 124.50 and the full countdown. Evidence: Missing.

## S-11 A new amount after a failed handshake

Failed, new amount: the state reads an empty amount. Evidence: Missing.

## S-12 Back after a payment

Handed over, payment ended: the state reads an empty amount. Evidence: Missing.

## S-13 Bluetooth is lost while on air

Advertised, the advertiser fake reports Bluetooth off: the state reads the reason and 124.50 not locked; the session closed. Evidence: Missing.
