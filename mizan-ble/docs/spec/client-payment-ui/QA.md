# Client payment UI — QA

Driven by snapshot tests of each screen from a client state fixture,
compared with the design's export of the matching frame, and by view tests
that tap and read the event sent.

## S-1 Reviewing

Review fixture: matches M5's client side; each button sends its event. Evidence: Missing.

## S-2 Declined

Declined fixture: matches M6's client side. Evidence: Missing.

## S-3 Waiting for the host

Waiting fixture: matches M7's client side. Evidence: Missing.

## S-4 The host cancelled

Host-cancelled fixture: the declined mark, the words, not charged. Evidence: Missing.

## S-5 Paid

Paid fixture: matches M8's client side. Evidence: Missing.

## S-6 Payment failed

Failed-payment fixture: matches M9's client side. Evidence: Missing.

## S-7 Link lost before a result

Unknown fixture: the link-lost mark and the words result unknown. Evidence: Missing.

## S-8 Link lost with nothing charged

Lost-not-charged fixture: the link-lost mark, not charged. Evidence: Missing.

## S-9 A confirm on its way

Confirm-on-its-way fixture: the confirm marked Sending, no button enabled. Evidence: Missing.

## S-10 A decline on its way

Decline-on-its-way fixture: the decline marked Sending, no button enabled. Evidence: Missing.

## S-11 A confirm too large to send

Too-large-confirm fixture: the payment-failed mark, nothing sent or charged, Finish enabled. Evidence: Missing.
