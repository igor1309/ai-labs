# Mizan BLE design

The design lives in one file, [mizan-ble.pen](mizan-ble.pen). How to open,
edit and save it through the pencil MCP is in the repo's `AGENTS.md`
§ Designing in pen.dev.

## Design system

The frame "Mizan · Design System" holds it: a dark ground, the host in
orange, the client in cyan. Its tokens are the file's `mz-*` variables and
its components are named "DS / …". The other variables belong to the
Explorations frame and are not tokens.

The light appearance draws from the same tokens with `theme: {mode:
"light"}`: "Mizan · Design System · Light" and "Mizan · Paired Flow ·
Light" show it, the latter for five moments of the flow. Light accents are
darker than dark ones, so text on them and on the light ground keeps
4.5:1.

The app's `DesignSystem` module (`mizan-ble/ios/Sources/DesignSystem/`)
draws the same components from the same tokens. Its
`DesignSystemGallery` shows them all on one page, to compare with the
frame.

## Tokens

The app's tokens are generated straight from this file's variables; a
`.pen` file is JSON. A token change in the design ships in the same commit
as the regenerated Swift: in `mizan-ble/ios`, run
`python3 -I scripts/generate-tokens.py`. It writes
`Sources/DesignSystem/Tokens.swift` from the `mz-*` variables. CI runs it
with `--check`, which exits 1 when that file no longer matches the design,
and on any change to this file.

Each `mz-*` colour has a dark and a light value on the `mode` theme axis.
Dark remains the reference design. The module picks the value from the
SwiftUI environment's colour scheme, following the device's appearance.
Unthemed colours use the same value in both appearances; numbers and
strings remain unthemed.
