# Host payment — QA

Driven through its reducer as tables, and through the machine with fakes
of the session, sender and link. The fakes record what was sent, ended and
closed; rows read that record and the state.

## S-1 Waiting for the client

Built with 124.50 sent: the state reads awaiting, 124.50. Evidence: Missing.

## S-2 The client declines

A decline event: the state reads declined, new amount offered; the sender fake holds an acknowledgement of a decision. Evidence: Missing.

## S-3 The client confirms

A confirm event: the state reads outcome to pick at once; the sender fake holds an acknowledgement. Evidence: Missing.

## S-4 The operator picks success

Confirmed, success: the sender fake holds a success result; the state reads paid, sent, new amount offered. Evidence: Missing.

## S-5 The operator picks failure

Confirmed, failure: the sender fake holds a failure result; the state reads failed, sent. Evidence: Missing.

## S-6 The link drops before a decision

Awaiting, link lost: the state reads lost, nothing charged. Evidence: Missing.

## S-7 The link drops before the outcome

Confirmed, link lost: the state reads lost, no result sent; the sender fake holds no result. Evidence: Missing.

## S-8 The operator cancels

Awaiting, cancel: the sender fake holds an end message, then the link ended; the state reads ended, nothing charged. Evidence: Missing.

## S-9 A message that does not open

Awaiting, a message the session fake refuses: the state still reads awaiting, nothing sent. Evidence: Missing.

## S-10 A result that cannot be sent

Confirmed, success, the sender fake fails: the state reads lost, no result sent. Evidence: Missing.

## S-11 A new amount

Ended, new amount: the state reads over; a send effect is never asked for after it. Evidence: Missing.

## S-12 A confirm's acknowledgement that cannot be sent

A confirm, the sender fake fails the acknowledgement: the state reads lost, no result sent. Evidence: Missing.

## S-13 A decline's acknowledgement that cannot be sent

A decline, the sender fake fails the acknowledgement: the state reads lost, nothing charged. Evidence: Missing.
