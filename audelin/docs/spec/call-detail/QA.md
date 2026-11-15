# Call detail, versions — QA

Each row is a reducer test paired with its effect test, through a fake
notes port; intentions and facts are read from the machine's output.

## S-1 Attribution

Reducer: notes read made with Daily → attribution Daily. Effect: read notes
delivers the fixture pair. Evidence: Missing.

## S-2 Switching to Previous

Reducer: version chosen Previous → shown Previous; Copy text equals
Previous text. Effect: none. Evidence: Missing.

## S-3 New notes show as Current

Reducer: publication notification → effect read notes; answered → shown
Current. Effect: read notes delivers the new pair. Evidence: Missing.

## S-4 A failure beside the notes

Reducer: notes + progress failed → failure and the same pair. Effect: none.
Evidence: Missing.

## S-5 Cancelling beside the notes

Reducer: notes + progress ended cancelled → no progress, same pair.
Effect: none. Evidence: Missing.

## S-6 Cancelling making notes again

Reducer: progress + cancel chosen → intention (call, cancel), no effect.
Effect: none. Read back the output's one value. Evidence: Missing.

## S-7 The menu's facts

Reducer: notes made with Daily + progress started → facts (call, has notes,
Daily, busy). Effect: none. Read back the output's last value. Evidence: Missing.
