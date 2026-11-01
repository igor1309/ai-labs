# Message codec — QA

Driven as pure functions with fixed byte fixtures. Rows compare bytes and
values read back.

## S-1 A session round trip

A 33-byte key and 16-byte id: encoded to 50 bytes starting with 1, decoded to the same key and id. Evidence: `MessageCodecTests.sessionRoundTrip`.

## S-2 A frame round trip

An amount frame with counter 7 and a 37-byte box: unframed to the same kind, counter and box. Evidence: `MessageCodecTests.frameRoundTrip`.

## S-3 An amount round trip

124.50: encoded to 12450 big-endian, decoded to 124.50. Evidence: `MessageCodecTests.amountRoundTrip`.

## S-4 A decision round trip

Confirm: one byte 1, decoded to confirm. Evidence: `MessageCodecTests.decisionRoundTrip`.

## S-5 A result round trip

Failure: one byte 2, decoded to failure. Evidence: `MessageCodecTests.resultRoundTrip`.

## S-6 An acknowledgement round trip

An acknowledgement of a decision: one byte 2, decoded to that. Evidence: `MessageCodecTests.acknowledgementRoundTrip`.

## S-7 A short frame

A frame of 4 bytes: unreadable. Evidence: `MessageCodecTests.shortFrameIsUnreadable`.

## S-8 An unknown kind

Kind 9: unreadable. Evidence: `MessageCodecTests.unknownFrameKindIsUnreadable`.

## S-9 A session of another version

Version 2: unreadable. Evidence: `MessageCodecTests.otherSessionVersionIsUnreadable`.

## S-10 A decision value out of range

Decision byte 3: unreadable. Evidence: `MessageCodecTests.unknownDecisionValueIsUnreadable`.
