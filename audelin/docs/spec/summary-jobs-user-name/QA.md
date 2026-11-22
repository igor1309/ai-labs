# Summary jobs, the user's name — QA

Reducer tests drive state and effects directly, each paired with an effect
test; effect tests use fake ports. Recovery reads saved attempts through the
storage boundary.

## S-1 The name reaches both requests

Drive: prepare a run whose preferences answer carries a name; deliver the
transcript. Evidence: `UserNameTests.preparedNameReachesIdentifyAndNotes`
reads the name in both effects.

## S-2 A later change does not reach a run

Drive: prepare with one name, send a preferences change with another before
the notes effect. Evidence: `UserNameTests.aLaterNameDoesNotReachAPreparedRun`.

## S-3 Recovery uses the saved name

Drive: save a pending attempt with a name; load jobs. Evidence:
`UserNameTests.recoveryResumesWithTheSavedName`.

## S-4 No name is carried as no name

Drive: prepare with no name. Evidence: `UserNameTests.noNameIsCarriedAsNoName`.

