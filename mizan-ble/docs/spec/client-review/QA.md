# Client review — QA

Driven through its reducer as tables, and through the machine with fakes
of the session, sender (with a chosen largest write and a chosen answer)
and link. Rows read the state and what the fakes recorded.

## S-1 Reviewing the amount

Built with MIZAN-7F3A and 124.50: the state reads reviewing MIZAN-7F3A, 124.50, confirm and decline offered. Evidence: Missing.

## S-2 The payer declines

Decline, the sender fake accepts, the host's acknowledgement opens: the state reads declined, host told, not charged. Evidence: Missing.

## S-3 The payer confirms

Confirm, accepted, acknowledged: the state reads handed over, confirm acknowledged. Evidence: Missing.

## S-4 A confirm on its way

Confirm, no acknowledgement (the sender fake's answer held back, then accepted): the state reads confirm on its way throughout. Evidence: Missing.

## S-5 A decline on its way

Decline, no acknowledgement: the state reads decline on its way. Evidence: Missing.

## S-6 The link drops during the review

Reviewing, link dropped: the session closed; the state reads lost, not charged. Evidence: Missing.

## S-7 The link drops after a confirm was sent

Confirm sent, link dropped: the state reads lost, result unknown. Evidence: Missing.

## S-8 The link drops after a decline was sent

Decline sent, link dropped: the state reads lost, not charged. Evidence: Missing.

## S-9 The host cancels

Reviewing, an end message: the link dropped, the session closed; the state reads host cancelled, not charged. Evidence: Missing.

## S-10 The host cancels as the payer confirms

Confirm sent, an end message: the state reads host cancelled, not charged. Evidence: Missing.

## S-11 The host refuses the decision

Confirm, the sender fake answers with an ATT error: the link dropped; the state reads lost, not charged. Evidence: Missing.

## S-13 A message that does not open

Reviewing, a message the session fake refuses: the state still reads reviewing. Evidence: Missing.

## S-14 Done

Declined, done: the state reads over. Evidence: Missing.

## S-15 The host cancels as the payer declines

Decline sent, the sender fake's answer held back, then an end message: the state reads host cancelled, nothing charged; the session fake closed. Evidence: Missing.
