# Client UI — QA

Driven by snapshot tests of each screen from a client state fixture,
compared with the design's export of the matching frame, and by view tests
that tap and read the event sent.

## S-1 No host nearby

No-host fixture: matches M1's client side, Start disabled. Evidence: Missing.

## S-2 A host in range

In-range fixture: matches M2's client side; Start sends its event. Evidence: Missing.

## S-3 Hold closer

Hold-closer fixture: the words, Start disabled. Evidence: Missing.

## S-4 The host went quiet

Gone fixture: matches M10's client side. Evidence: Missing.

## S-5 Connecting

Connecting fixture: matches M3's client side; Cancel sends its event. Evidence: Missing.

## S-6 Could not connect

Failed fixture: matches M4's client side; Try again sends its event. Evidence: Missing.

## S-7 Bluetooth off

Bluetooth-off fixture: the reason, Start disabled. Evidence: Missing.

## S-8 A host with no name yet

Chosen-host fixture with no name: "Mizan till" in place of the name, Start enabled. Evidence: Missing.
