# Live panel presentation — QA

The moved capabilities retain their existing verification; no behavior changes.

## S-4 Text settles in place

Run `cd audelin/macos && swift test --filter PanelUI` and the existing held-selection and reading suites; inspect rendered panel text and selection geometry with the current scenario drive.

## S-5 A selection is held

Run `cd audelin/macos && swift test --filter PanelUI` and the existing held-selection and reading suites; inspect rendered panel text and selection geometry with the current scenario drive.

## S-6 The panel stays visible beside the call

Missing macOS focus trial: launch the shipping Audelin panel, bring Zoom or another call app frontmost, and capture the desktop showing that panel remains visible. Run `cd audelin/macos/App && swift test --filter FloatingPanelTests` in addition to the trial; PanelUI image/selection tests alone do not prove focus policy.

## S-11 Held selections add up

Run `cd audelin/macos && swift test --filter PanelUI` and the existing held-selection and reading suites; inspect rendered panel text and selection geometry with the current scenario drive.

## S-12 A click keeps what is held

Run `cd audelin/macos && swift test --filter PanelUI` and the existing held-selection and reading suites; inspect rendered panel text and selection geometry with the current scenario drive.

## S-13 Letting go of a held selection

Run `cd audelin/macos && swift test --filter PanelUI` and the existing held-selection and reading suites; inspect rendered panel text and selection geometry with the current scenario drive.

## S-14 A held selection leaves the transcript

Run `cd audelin/macos && swift test --filter PanelUI` and the existing held-selection and reading suites; inspect rendered panel text and selection geometry with the current scenario drive.

## S-16 The panel says live text is getting ready

Run `cd audelin/macos && swift test --filter PanelUI` and the existing held-selection and reading suites; inspect rendered panel text and selection geometry with the current scenario drive.

