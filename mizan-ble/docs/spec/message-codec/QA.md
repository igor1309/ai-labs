# Message codec — QA

Driven as pure functions with fixed byte fixtures. Rows compare bytes and
values read back.

## S-1 A session round trip

A 33-byte key and 16-byte id: encoded to 50 bytes starting with 1, decoded to the same key and id. Evidence: Missing.

## S-2 A frame round trip

An amount frame with counter 7 and a 37-byte box: unframed to the same kind, counter and box. Evidence: Missing.

## S-3 An amount round trip

124.50: encoded to 12450 big-endian, decoded to 124.50. Evidence: Missing.

## S-4 A decision round trip

Confirm: one byte 1, decoded to confirm. Evidence: Missing.

## S-5 A result round trip

Failure: one byte 2, decoded to failure. Evidence: Missing.

## S-6 An acknowledgement round trip

An acknowledgement of a decision: one byte 2, decoded to that. Evidence: Missing.

## S-7 A short frame

A frame of 4 bytes: unreadable. Evidence: Missing.

## S-8 An unknown kind

Kind 9: unreadable. Evidence: Missing.

## S-9 A session of another version

Version 2: unreadable. Evidence: Missing.

## S-10 A decision value out of range

Decision byte 3: unreadable. Evidence: Missing.
