# Client review — QA

Driven through its reducer as tables, and through the machine with fakes
of the session, sender (with a chosen largest write and a chosen answer)
and link. Rows read the state and what the fakes recorded.

## S-1 Reviewing the amount

Built with MIZAN-7F3A and 124.50: the state reads reviewing MIZAN-7F3A, 124.50, confirm and decline offered. Evidence: `ClientReviewTests.reviewingTheHandedOverAmount`.

## S-2 The payer declines

Decline, the sender fake accepts, the host's acknowledgement opens: the state reads declined, host told, not charged. Evidence: `ClientReviewTests.payerDeclines`.

## S-3 The payer confirms

Confirm, accepted, acknowledged: the state reads handed over, confirm acknowledged. Evidence: `ClientReviewTests.payerConfirms`.

## S-4 A confirm on its way

Confirm, no acknowledgement (the sender fake's answer held back, then accepted): the state reads confirm on its way throughout. Evidence: `ClientReviewTests.confirmStaysOnItsWayThroughTheWriteResponse`.

## S-5 A decline on its way

Decline, no acknowledgement: the state reads decline on its way. Evidence: `ClientReviewTests.declineStaysOnItsWay`.

## S-6 The link drops during the review

Reviewing, link dropped: the session closed; the state reads lost, not charged. Evidence: `ClientReviewTests.linkDropsDuringReview`.

## S-7 The link drops after a confirm was sent

Confirm sent, link dropped: the state reads lost, result unknown. Evidence: `ClientReviewTests.linkDropsAfterConfirm`.

## S-8 The link drops after a decline was sent

Decline sent, link dropped: the state reads lost, not charged. Evidence: `ClientReviewTests.linkDropsAfterDecline`.

## S-9 The host cancels

Reviewing, an end message: the link dropped, the session closed; the state reads host cancelled, not charged. Evidence: `ClientReviewTests.hostCancelsDuringReview`.

## S-10 The host cancels as the payer confirms

Confirm sent, an end message: the state reads host cancelled, not charged. Evidence: `ClientReviewTests.hostCancelsDuringConfirm`.

## S-11 The host refuses the decision

Confirm, the sender fake answers with an ATT error: the link dropped; the state reads lost, not charged. Evidence: `ClientReviewTests.refusedWriteIsNotCharged`.

## S-13 A message that does not open

Reviewing, a message the session fake refuses: the state still reads reviewing. Evidence: `ClientReviewTests.refusedMessageChangesNothing`.

## S-14 Done

Declined, done: the state reads over. Evidence: `ClientReviewTests.payerIsDone`.

## S-15 The host cancels as the payer declines

Decline sent, the sender fake's answer held back, then an end message: the state reads host cancelled, nothing charged; the session fake closed. Evidence: `ClientReviewTests.hostCancelsDuringHeldDecline`.
