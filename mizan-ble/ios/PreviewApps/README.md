# Preview apps

macOS apps that show one UI module in isolation, with controls and PNG export.
They live in a separate package so the product never depends on them. Requires
macOS 26 and Swift 6.2.

From this directory:

```sh
swift run ModeSwitchPreview
swift run ModeSwitchPreview --export /tmp/mizan-mode-switch
swift run HostPreview
swift run HostPreview --export /tmp/mizan-host
swift run SettingsPreview
swift run SettingsPreview --export /tmp/mizan-settings
swift run ClientPreview
swift run ClientPreview --export /tmp/mizan-client
swift run ClientPaymentPreview
swift run ClientPaymentPreview --export /tmp/mizan-client-payment
```

`ModeSwitchPreview` shows `ModeSwitchUI` in the DesignSystem iPad or iPhone
shell. Choose a side in the header; the event updates the chosen mode. Turn off
**At rest** to disable the switch and iPad settings gear. The controls include
light/dark appearance and an event log. A local tap counter in each stand-in
screen resets when you switch away and return.

Export writes 16 PNGs: host/client chosen, each enabled/disabled, on both devices
in light and dark. Files are named `<side>-<enabled|disabled>-<device>-<light|dark>.png`.
The iPad images are 1194 × 834 pixels and the iPhone images 393 × 852 pixels,
without preview controls or window chrome. Each screen gets the safe area its
design frame's status bar and home indicator take, as a device would give it.

`HostPreview` shows every named `HostUI` preview at iPad size. Taps add to
the event log; the picker alone changes the screen. Export writes 56 PNGs
(14 states on both devices in both appearances), named
`<preview-name>-<iPad|iPhone>-<light|dark>.png`; the iPhone images use the
compact layout.

`SettingsPreview` shows every entry of `SettingsUI`'s preview list at iPad
size. Countdown taps and Done add to the event log; the picker alone changes
the screen. Export writes 20 PNGs, one per state on each device in each
appearance, named `s1-settings-<seconds>s-<iPad|iPhone>-<light|dark>.png`.

`ClientPreview` shows every named `ClientUI` preview at iPhone size. Start,
Cancel and Try again add to the event log; the picker alone changes the
screen. Export writes 16 PNGs, one per state and appearance, named
`<preview-name>-iPhone-<light|dark>.png`, at 393 × 852 pixels.

`ClientPaymentPreview` shows every named `ClientPaymentUI` preview at iPhone
size. Confirm, Decline and Done add to the event log; the picker alone changes
the screen. Export writes 26 PNGs, one per state and appearance, named
`<preview-name>-iPhone-<light|dark>.png`, at 393 × 852 pixels.

Each has a state picker, light/dark appearance and the event log.

`PreviewKit` provides `PreviewWindow` (content over a backdrop on the left,
controls, appearance and events on the right), `PreviewDeviceSize` dimensions, and
`PreviewExporter`. To add an app, give it an executable target depending on
`PreviewKit` and the feature's products. Supply one named `PreviewSnapshot` per
state to the exporter; it renders each in both appearances, on both devices
unless the app passes a smaller `devices` list.
There are no tests in this package; compare the exports with the design.

## What a preview app holds

A preview app runs the real view. `HostPreview`, `SettingsPreview`, `ClientPreview` and `ClientPaymentPreview` hold only the selected
preview and the event log: a tap is logged, and the picker alone changes the
screen. The picker and the exporter read the module's named preview list.
`ModeSwitchPreview` also lets the tap change the chosen side.

A preview app copies no feature code; when it needs a type the product lacks,
the type belongs in the product. Driving a screen live with its real
machines, and timers, Bluetooth and the processor stubbed, is later work, once
the machines exist.
