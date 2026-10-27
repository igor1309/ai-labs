# Client radio — QA

The binding over `CBCentralManager` and `CBPeripheral` is thin; the
translation is driven through a fake of the binding that plays the
delegate calls and records what was asked of it. Proven for real by the
user spec on a real iPhone.

## S-1 Bluetooth state is told

The fake reports unauthorized: the event reads not allowed. Evidence: Missing.

## S-2 Readings while scanning

Three discoveries of one host at −50, −52, −51: three readings with those values and their times. Evidence: Missing.

## S-3 Connecting to a host

Connect, the fake answers each step: the event reads the session bytes and a largest write of 182. Evidence: Missing.

## S-4 A setup step fails

Connect, the fake finds no Mizan service: the event reads could not connect, no service. Evidence: Missing.

## S-5 Writing the key

Write a 33-byte key, the fake answers: the event reads answered. Evidence: Missing.

## S-6 A write too large

Largest write 20, write 41 bytes: the event reads failed; the fake was asked for nothing. Evidence: Missing.

## S-7 A message from the host

The fake notifies 41 bytes on To client: the event reads those bytes. Evidence: Missing.

## S-8 The link drops

The fake reports a disconnect: the event reads dropped. Evidence: Missing.

## S-9 The host removes its service

The fake reports the Mizan service invalidated: the event reads dropped. Evidence: Missing.

## S-10 Dropping the link

Drop, then the fake notifies: the event reads dropped, and nothing after. Evidence: Missing.

## S-11 Starting a running scan

Scanning, start again, one discovery: the fake was asked to scan once, and one reading came out. Evidence: Missing.
