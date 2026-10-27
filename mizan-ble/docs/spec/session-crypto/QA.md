# Session crypto — QA

Driven through two real sessions in one test process: CryptoKit is a
library, not hardware. Rows open what was sealed and read the bytes back.

## S-1 Both sides derive the same key

Host and client derive with each other's keys: the client opens the host's amount, the host the client's confirm. Evidence: Missing.

## S-2 A tampered message

A sealed amount with its 20th byte flipped: refused; the untouched amount then opens. Evidence: Missing.

## S-3 A replayed message

A confirm opened, then the same bytes again: refused. Evidence: Missing.

## S-4 A message from another transaction

A message from session one into session two: refused. Evidence: Missing.

## S-5 A message after the session closed

The host's session closed, then a message sealed before: refused, and sealing throws closed. Evidence: Missing.

## S-6 A message sent back to its sender

A host-sealed amount handed back to the host: refused. Evidence: Missing.

## S-7 A kind that was changed

An amount opened as a result: refused. Evidence: Missing.

## S-8 A public key that is not a key

33 bytes of zeros as the client key: no key; seal throws. Evidence: Missing.

## S-9 The same plaintext twice

The same confirm sealed twice: two different byte strings. Evidence: Missing.

## S-10 A counter that goes back

Counter 3 opened, then a message with counter 2: refused. Evidence: Missing.

## S-11 Nothing carries over

Two host sessions in a row: different public keys and session ids. Evidence: Missing.

## S-12 The last counter

A session whose send counter is set to 2³²−1 through the test seam: seal throws, and opening then fails as closed. Evidence: Missing.
