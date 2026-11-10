# Save pacing — QA

Driven through fakes of its own interfaces: a store that keeps the value
of each save that returns, and can hold a save or fail chosen ones, so a
row reads back what is kept, never just that a save was called; a failure
report that records what it is told, in order with finish's return; and a
pause the test holds and releases. Values are numbers.

## S-1 Only the latest value is saved after a slow save

The first save held, two more values sent, then released; the next and
last kept value is the third, and the second was never saved.
Evidence: Missing.

## S-2 A failed save is told

Value 1's save fails; the report holds that one failure. Evidence: Missing.

## S-7 A save failing again is not told again

Saves of 1, 2 and 3 fail; the report holds only the first. Evidence: Missing.

## S-8 A failure after a success is told again

1 fails, 2 is kept, 3 fails; the report holds the failures of 1 and 3, in
order, and the store keeps 2. Evidence: Missing.

## S-3 A save after a failed one keeps the newer value

Value 1's save fails, value 2 comes; the store keeps 2. Evidence: Missing.

## S-4 Saves are spaced by a pause

Value 1 is kept and the pause held; values 2 and 3 come; the store keeps
1 while the pause is held; released, it keeps 3, and 2 was never saved. The cycle repeats: with
the pause after 3 held, 4 and 5 come and the store keeps 3 until it is
released, then 5.
Evidence: Missing.

## S-5 Finishing ends the pause

Value 1 kept, the pause held, value 2 comes; finish without releasing the
pause; the save of 2 starts and is held, and finish has not returned;
released, the store keeps 2 and finish returns, the pause never released. Evidence: Missing.

## S-6 Finishing after a failed last save

Value 1's save fails while held; finish is called, the save released and
the report held; finish has not returned until the report is released,
and the report holds the failure. Evidence: Missing.

## S-9 A failed save is followed by a pause too

Value 1 kept, value 2's save fails and the pause after it is held; values
3 and 4 come; the store keeps 1 while held; released, it keeps 4, and 3
was never saved. Evidence: Missing.
