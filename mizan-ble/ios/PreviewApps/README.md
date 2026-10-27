# Preview apps

macOS apps that show one UI module in isolation, with plain stand-in screens.
They live in a separate package so the product never depends on them. Requires
macOS 26 and Swift 6.2.

From this directory:

```sh
swift run ModeSwitchPreview
swift run ModeSwitchPreview --export /tmp/mizan-mode-switch
swift run SettingsPreview
swift run SettingsPreview --export /tmp/mizan-settings
```

`ModeSwitchPreview` shows `ModeSwitchUI` in the DesignSystem iPad or iPhone
shell. Choose a side in the header; the event updates the chosen mode. Turn off
**At rest** to disable the switch and iPad settings gear. The controls include
light/dark appearance and an event log. A local tap counter in each stand-in
screen resets when you switch away and return.

Export writes 16 PNGs: host/client chosen, each enabled/disabled, on both devices
in light and dark. Files are named `<side>-<enabled|disabled>-<device>-<light|dark>.png`.
The iPad images are 1194 × 834 pixels and the iPhone images 393 × 852 pixels,
without preview controls or window chrome.

`SettingsPreview` shows every entry of `SettingsUI`'s preview list at iPad size,
with a state picker, light/dark appearance and an event log. Countdown taps and
Done only log events; choose a preview to change the displayed state. Export
writes 10 PNGs, one per state in each appearance, named
`s1-settings-<seconds>s-iPad-<light|dark>.png`, at 1194 × 834 pixels.

`PreviewKit` provides `PreviewWindow` (content over a backdrop on the left,
controls, appearance and events on the right), `PreviewDeviceSize` dimensions, and
`PreviewExporter`. To add an app, give it an executable target depending on
`PreviewKit` and the feature's products. Supply one named `PreviewSnapshot` per
state to the exporter; it renders each on both devices in both appearances by
default. Pass `devices: [.iPad]` for an iPad-only screen.
There are no tests in this package; compare the exports with the design.

## What a preview app holds

A preview app runs the real view, not a picture of it. Its state lives in
the app (`@State`). A state-catalogue app such as `SettingsPreview` logs events
and changes the displayed state only through its picker. An app demonstrating
transitions changes state on events, so a tap shows the next screen.
For a screen a machine drives, the app runs the package's real
machine and stubs only what reaches outside: timers, Bluetooth, the
processor. Fixtures are named states for the exporter and the controls.

A preview app is as large as that stand-in needs to be: a toggle for the
mode switch, a machine and its stubs for a payment screen. It copies no
feature code; when it needs a type the product lacks, the type belongs in
the product.
