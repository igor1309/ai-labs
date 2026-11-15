# Preferences, keep — QA

The adapter is tested against a fresh `UserDefaults` suite per test; a
failed save through a fake of its settings binding.

## S-1 On when never set

Drive: empty suite; read back on. Evidence: Missing.

## S-2 A saved choice is read back

Drive: save off, build a new adapter on the same suite; read back off.
Evidence: Missing.

## S-3 A change is observed

Drive: subscribe, save off; read back the one received value off.
Evidence: Missing.

## S-4 Other preferences keep it

Drive: save off, then save the summaries-enabled preference; read back off.
Evidence: Missing.

## S-5 A failed save is reported

Drive: fake binding fails; save off; read back the failure and on.
Evidence: Missing.
