# Call events QA

Driven through a fake live call and a fake clock; each row reads back the
events' text against the fake call's parts. Waits are handshakes: the fake
clock reports the wait before time moves.

## S-1 No call is said while none is live
Drive: fake with no call; the event says no call. Evidence: Missing.

## S-2 A window comes when its time has passed
Drive: size 3, overlap 1; parts at 0:30, 2:30, 3:00; after the wait is reported, advance to 2:59 (no event) then 3:00: the window holds 0:30 and 2:30, not 3:00. Evidence: Missing.

## S-4 A window with no words comes empty
Drive: a live call with no parts; advance past 3:00; an empty window comes. Evidence: Missing.

## S-5 Joining mid-call gives what was said before
Drive: join at 10:00 with parts from 0:10 to 9:50, then again at 2:00 with parts at 0:40 and 1:50; each first event holds every part; at 11:00 the next window holds 8:00–11:00. Evidence: Missing.

## S-6 A call starting after no call is joined
Drive: no call, take an event; the next event is still pending after the clock moves; add a call; the next events are its windows. Evidence: Missing.

## S-7 Words saved late come in the next window
Drive: window to 3:00 given; add a part at 2:40; the window to 5:00 holds it once. Evidence: Missing.

## S-8 A late reader gets every due window in turn
Drive: advance to 9:00 before reading; windows to 3, 5, 7, 9 come once each, in order. Evidence: Missing.

## S-9 The windows left come before the end
Drive: advance to 7:00 unread, end the call at 7:00; windows to 3, 5, 7, then the end, with no extra window. Evidence: Missing.

## S-11 A failed read gives an empty window
Drive: the fake fails at 3:00; the window to 3:00 comes empty; it recovers; the window to 5:00 holds 2:00–5:00 whole; a fake that never recovers gives only empty windows. Evidence: Missing.

## S-12 A call ending between windows gives its last words
Drive: size 3, overlap 1; parts at 2:50 and 4:10, end at 4:30; then a call of 1:20 with one part; each ends with a window holding its last part, then the end. Evidence: Missing.

## S-13 New words can be told from the overlap
Drive: size 3, overlap 1; parts at 2:30 and 4:00; the window to 5:00 marks 2:30 as context and 4:00 as new. Evidence: Missing.

## S-14 An overlap alone reads as no new words
Drive: a part at 2:30 only; the window to 5:00 holds it as context and no new words. Evidence: Missing.
