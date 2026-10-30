# Settings — QA

Driven through a fake store held in memory and shared between two
settings instances where a row needs a second read.

## S-1 Defaults on a fresh install

Empty store: countdown 60, α 0.3, window 1 s and 5, floor −65, margin 6, fade 2, drop gap 6, hold 1. Evidence: `SettingsTests.freshStoreReadsDefaults`.

## S-2 Choosing a countdown

Choose 30: 30, and a second instance on the same store reads 30. Evidence: `SettingsTests.chosenCountdownSurvivesANewInstance`.

## S-3 A countdown that is not offered

Choose 45: refused, still 60. Evidence: `SettingsTests.unofferedCountdownIsRefused`.

## S-4 A stored value out of range

Floor 0 stored: the default −65. Evidence: `SettingsTests.invalidStoredNumbersReadDefaults`.

## S-5 The advertised name is made once

Two reads on an empty store: the same name, matching `MIZAN-[0-9A-F]{4}`. Evidence: `SettingsTests.advertisedNameIsGeneratedOnce`.

## S-6 A picker value from the store

Margin 8 stored: 8. Evidence: `SettingsTests.validStoredPickerValuesAreReadAtEachRead`.

## S-7 A drop gap from the store

Drop gap 4 stored: 4. Evidence: `SettingsTests.storedDropGapIsRead`.

## S-8 A drop gap out of range

Drop gap 25 stored: the default 6. Evidence: `SettingsTests.outOfRangeDropGapReadsDefault`.

## S-9 A hold from the store

Hold 0.5 stored: 0.5. Evidence: `SettingsTests.storedHoldIsRead`.

## S-10 A hold out of range

Hold 6 stored: the default 1. Evidence: `SettingsTests.outOfRangeHoldReadsDefault`.
