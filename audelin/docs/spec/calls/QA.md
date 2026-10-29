# Calls — QA

An adapter over the file system, so every row runs against fresh
temporary calls folders, never the user's own, and checks them from
outside the adapter with `FileManager`. The adapter is given the time zone
`Asia/Tokyo` while the process runs in `America/Los_Angeles`, so starts
are known and the given zone is proven used. Track lengths come from
short `.caf` files written in the test. Steps that can fail (copy, size
check, rename, delete) are reached through closures the adapter is given,
so each failure is made on purpose, not by filling a disk. The real calls
of the user spec (LAB-746, LAB-747) prove the whole path.

## S-1 Calls are listed newest first

Calls `2026.10.24-1405 Zoom`, `2026.10.24-1405-2` and `2026.10.25-0900
Синк`; the list is the 25th, then `-1405-2`, then `-1405`, each with its
id, title (`Синк`, empty, `Zoom`), start in Tokyo time, and duration the
longer of its two tracks.

## S-2 What is not a call is left out

A file and a link named like a call, and a folder `Notes`, beside one
call; only the call lists, and the three are unchanged.

## S-3 A call without readable audio still lists

A call with no tracks and one with a track of random bytes; both list,
with no duration.

## S-4 A rename keeps the call

`2026.10.24-1405 Zoom` renamed to `Онбординг: on-call/2` becomes
`2026.10.24-1405 Онбординг- on-call-2`, with the same files and bytes; a
rename to an empty title gives the bare prefix.

## S-5 A rename onto a taken name fails

A folder `2026.10.24-1405 Синк` exists beside the call; renaming the call
to `Синк` fails, and both folders keep their names and bytes.

## S-6 A delete removes the call

The call's folder and its files are gone; a call beside it is unchanged.

## S-7 A move keeps the call whole

The call is in the target under the same name with every file's bytes,
the source is gone, and no temporary folder is left in either.

## S-8 A failed move leaves the call where it was

For each of a failing copy, a size mismatch and a failing rename: the move
fails, the source is whole, and the target holds nothing. A call already
in the target under the same name fails the move and changes neither.

## S-9 A call renamed in Finder is still found

The call's folder is renamed outside the adapter, prefix kept; rename,
delete and move by its id each apply to it.

## S-10 A call that is gone fails the action

The folder is removed first; rename, delete and move by its id each fail
and change nothing.

## S-11 Counting the calls

Two calls of known file sizes and a file that is not a call; the count is
two and the size is the sum of the calls' files.
