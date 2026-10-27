# Preview apps

macOS apps that show one UI module in isolation.
They live in a separate package so the product never depends on them. Requires
macOS 26 and Swift 6.2.

From this directory:

```sh
swift run ModeSwitchPreview
swift run ModeSwitchPreview --export /tmp/mizan-mode-switch
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
without preview controls or window chrome.

`ClientPaymentPreview` shows every named `ClientPaymentUI` preview state at
iPhone size, with a state picker, light/dark appearance and an event log.
Confirm, Decline and Done only append to the log; the selected state stays on
screen. Export writes 26 PNGs, one per state and appearance, named
`<preview-name>-iPhone-<light|dark>.png`, at 393 × 852 pixels.

`PreviewKit` provides `PreviewWindow` (content over a backdrop on the left,
controls, appearance and events on the right), `PreviewDeviceSize` dimensions, and
`PreviewExporter`. To add an app, give it an executable target depending on
`PreviewKit` and the feature's products. Supply one named `PreviewSnapshot` per
state to the exporter; it renders each in both appearances, on both devices by
default. Pass `devices: [.iPhone]` for an iPhone-only screen.
There are no tests in this package; compare the exports with the design.

## What a preview app holds

A preview app renders the module's given states and records its events. The
picker and exporter use the same named preview list. The mode-switch app also
lets its toggle change the chosen mode. Payment previews hold no stand-in flow
or machine; driving a screen live with real machines and stubbed timers,
Bluetooth and processor is later work, once the machines exist. A preview app
copies no feature code.
