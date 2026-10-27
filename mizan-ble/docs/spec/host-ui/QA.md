# Host UI — QA

Driven by snapshot tests of each screen from a host state fixture,
compared with the design's export of the matching frame, and by view tests
that tap and read the event sent.

## S-1 Typing an amount

Typing fixture with Bluetooth on: matches M1; Lock disabled at 0, a tap at 124.5 sends lock. Evidence: Missing.

## S-2 Broadcasting

Advertising fixture: matches M2; Cancel sends its event. Evidence: Missing.

## S-3 Timed out

Timed-out fixture: matches M10's host side. Evidence: Missing.

## S-4 A client is connecting

Handshake fixture: matches M3. Evidence: Missing.

## S-5 The handshake failed

Failed fixture: matches M4; each button sends its event. Evidence: Missing.

## S-6 Waiting for the client

Awaiting fixture (amount sent): matches M5; Cancel sends its event. Evidence: Missing.

## S-7 Declined

Declined fixture: matches M6. Evidence: Missing.

## S-8 Picking the outcome

Confirmed fixture: matches M7; each outcome button sends its event. Evidence: Missing.

## S-9 Paid

Paid fixture: matches M8. Evidence: Missing.

## S-10 Failed

Failed-payment fixture: matches M9. Evidence: Missing.

## S-11 The client was lost

Link-lost fixture, amount sent, no result sent: shows the link-lost mark and New amount. Evidence: Missing.

## S-12 Bluetooth off

Bluetooth-off fixture: shows the reason, Lock disabled. Evidence: Missing.

## S-13 The host could not go on air

Could-not-go-on-air fixture: shows the reason, 124.5 still typed, Lock enabled. Evidence: Missing.
