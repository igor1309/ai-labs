# Calls — the previous transcript — QA

Calls is driven for real on a temp calls folder: fixture call folders,
merged ones with nested parts, and bytes read back from disk. A failing
file operation and an interruption come from the file binding's fake, at
each step of a pair change; restart is a new Calls on the same folder.

## S-1 Publishing keeps the old transcript beside

Publish: the current file holds the new bytes; the previous equals the old bytes.
Evidence: Missing.

## S-2 Publishing drops an older previous

Publish into a call with a previous: exactly the new and the replaced file remain.
Evidence: Missing.

## S-3 A failed publish leaves the pair

Fail at each step after the first move: both files equal their bytes before; the error is returned.
Evidence: Missing.

## S-4 An interrupted publish is settled at start

Interrupt publishing at each step, start a new Calls: the old pair or the new, whole, no stray file.
Evidence: Missing.

## S-5 Restoring swaps the two

Restore: the two files have swapped bytes.
Evidence: Missing.

## S-6 A failed restore leaves the pair

Fail the swap at each step: both files equal their bytes before; the error is returned.
Evidence: Missing.

## S-7 Restoring without a previous is refused

Restore a call with no previous: refused with the reason; the folder unchanged.
Evidence: Missing.

## S-8 A listing tells the previous transcript

List: the call with a previous reads has-previous; the other not.
Evidence: Missing.

## S-9 A listing tells missing tracks

List a merged call whose second part lacks its call track: that part and track named.
Evidence: Missing.

## S-10 The transcript's identity follows its bytes

Read, publish changed bytes, read twice: later reads match each other, not the first; publish identical bytes: the identity is unchanged.
Evidence: Missing.

## S-11 A merged call's parts are untouched

Publish into a merged call: every part's files byte-identical to before.
Evidence: Missing.

## S-12 An interrupted restore is settled at start

Interrupt restoring at each step, start a new Calls: the old pair or the swapped pair, whole.
Evidence: Missing.

## S-13 Restoring brings back the identity

Read A, publish B, restore: the identity equals A's.
Evidence: Missing.

## S-14 A read during a change finds a whole pair

Hold a publish at each move and read the call's transcripts: the read answers only after the change, with the new pair whole; the same for a held restore.
Evidence: Missing.
