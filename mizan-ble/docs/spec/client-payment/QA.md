# Client payment — QA

Driven through its reducer as tables, and through the machine with fakes
of the session and link. Rows read the state and what the fakes recorded.

## S-1 Waiting for the host

Built with an acknowledged confirm for MIZAN-7F3A, 124.50: the state reads waiting, the host processing. Evidence: Missing.

## S-2 The host reports success

Waiting, a success result: the state reads paid 124.50 to MIZAN-7F3A; the link dropped, the session closed. Evidence: Missing.

## S-3 The host reports failure

Waiting, a failure result: the state reads failed, not charged. Evidence: Missing.

## S-4 The link drops before a result

Waiting, link dropped: the state reads lost, result unknown. Evidence: Missing.

## S-5 A message that does not open

Waiting, a message the session fake refuses: the state still reads waiting. Evidence: Missing.

## S-6 Done

Paid, done: the state reads over. Evidence: Missing.
