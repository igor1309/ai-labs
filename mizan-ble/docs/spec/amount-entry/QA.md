# Amount entry — QA

Driven through its reducer as a table of key in, amount and lockable out.
Rows read the amount as typed and whether it can be locked.

## S-1 Typing an amount

Empty, then 1, 2, 4, decimal point, 5: 124.5, lockable. Evidence: Missing.

## S-2 A third decimal

124.50, then 6: still 124.50. Evidence: Missing.

## S-3 A seventh whole digit

999999, then 9: still 999999. Evidence: Missing.

## S-4 A second decimal point

12.3, then decimal point: still 12.3. Evidence: Missing.

## S-5 A leading zero

0, then 7: 7. Evidence: Missing.

## S-6 Zero cannot be locked

0.00: not lockable. Evidence: Missing.

## S-7 Delete

124.5, delete: 124. Evidence: Missing.

## S-8 Bluetooth is not available

124.5, Bluetooth unavailable with reason off: 124.5, the reason off, not lockable. Evidence: Missing.
