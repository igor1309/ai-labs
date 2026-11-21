# Notes generation, naming the user — QA

Tests drive the generator with a spy text attempt and read the request it
received; no runtime runs.

## S-1 The user's lines carry the name

Evidence: `UserNameRequestTests.theUsersLinesCarryTheName`.

## S-2 The request says who recorded the call

Evidence: `UserNameRequestTests.theRequestSaysWhoRecorded`.

## S-3 Other lines keep their labels

Evidence: `UserNameRequestTests.otherLinesKeepTheirLabels`.

## S-4 No name, today's request

Drive: compare the request for no name with a fixture of today's request.
Evidence: `UserNameRequestTests.noNameKeepsTodaysRequest`.

## S-5 The same lines for speakers

Evidence: `UserNameRequestTests.namedLinesMatchTheNotesRequest`.
