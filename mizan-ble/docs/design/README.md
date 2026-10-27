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

The app's tokens are generated from [tokens.json](tokens.json), a snapshot of
this file's variables. A token change in the design ships in the same commit
as the refreshed snapshot and the regenerated Swift:

1. Through the pencil MCP, run `execute` on this file with
   `Print(JSON.stringify(GetVariables()))`.
2. Write the printed JSON to `tokens.json` with a 2-space indent and a final
   newline, so the diff shows only the changed tokens.
3. In `mizan-ble/ios`, run `python3 -I scripts/generate-tokens.py`. It writes
   `Sources/DesignSystem/Tokens.swift` from the `mz-*` variables;
   `--check` exits 1 when that file is stale, and CI runs it.

Each `mz-*` colour has a dark and a light value on the `mode` theme axis.
Dark remains the reference design. The module picks the value from the
SwiftUI environment's colour scheme, following the device's appearance.
Unthemed colours use the same value in both appearances; numbers and
strings remain unthemed.
