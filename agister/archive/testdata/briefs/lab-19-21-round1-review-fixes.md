# LAB-19, LAB-20, LAB-21: round 1 review fixes

Two rulings from the review; confirm each before fixing. Both are tests
proving a collaborator can be implemented outside package `app`; the
existing integration tests stay.

- **No external test implements `InspectionResolver`.** Add a double
  owned by package `app_test`, use it to run process and workflow
  inspection, and assert the views returned.
- **No test drives `Calls` through an independent `CallCancels`.** Add an
  external double and a normal test that triggers the callback it was
  given, asserts the call's cancelled result, and checks the registration
  is removed once the call completes.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
