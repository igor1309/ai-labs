# Timeout notice — QA

Driven through its reducer as tables, and its effect handler with a
spy of the timer. Rows read the state and what the spy recorded.

## S-1 A timeout shows the notice

Hidden, a timeout for attempt 3: the state reads showing for attempt 3; the timer started for attempt 3 with 30 seconds. Evidence: Missing.

## S-2 The notice ends on its own

Showing for attempt 3, its timer's end for attempt 3: the state reads hidden; nothing is started or stopped. Evidence: Missing.

## S-3 The operator acts

Showing for attempt 3, an action: the state reads hidden; the timer stopped for attempt 3. Evidence: Missing.

## S-4 An action with no notice

Hidden, an action: the state reads hidden; nothing is started or stopped. Evidence: Missing.

## S-5 A newer timeout

Showing for attempt 3, a timeout for attempt 4: the state reads showing for attempt 4; the timer started for attempt 4 with 30 seconds. Evidence: Missing.

## S-6 An older timer ends

Showing for attempt 4, the timer's end for attempt 3: the state still reads showing for attempt 4; nothing is started or stopped. Evidence: Missing.

## S-7 A timer ends after an action

Showing for attempt 3, an action, then the timer's end for attempt 3: the state reads hidden. Evidence: Missing.

## S-8 The same timeout told twice

Showing for attempt 3, a timeout for attempt 3 again: the state still reads showing for attempt 3; nothing is started or stopped. Evidence: Missing.

## S-9 The same timeout after its notice ended

Shown for attempt 3 and hidden, once by its timer's end and once by an action, then a timeout for attempt 3: the state reads hidden; nothing is started or stopped. Evidence: Missing.

## S-10 An older timeout

Showing for attempt 4, a timeout for attempt 3: the state still reads showing for attempt 4; nothing is started or stopped. Evidence: Missing.

## S-11 An older timeout after the notice ended

Shown for attempt 4 and hidden, once by its timer's end and once by an action, then a timeout for attempt 3: the state reads hidden; nothing is started or stopped. Evidence: Missing.
