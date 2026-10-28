# Preferences — QA

Driven against real `UserDefaults` in a suite made for each test and
removed after it.

## S-1 A value round trip

Write 30 under countdown: read 30. Evidence: `PreferencesTests.valueRoundTrips`.

## S-2 A value survives a new instance

Write 30, open a new instance on the suite: read 30. Evidence: `PreferencesTests.valueSurvivesANewInstance`.

## S-3 Nothing written

Read an unwritten key: nothing. Evidence: `PreferencesTests.unwrittenKeyReadsNothing`.
