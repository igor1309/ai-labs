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

`HostPreview` shows every named `HostUI` preview at the iPad size. Pick a
state, switch between light and dark, and inspect the events sent by the view.
Taps only add to the event log; the picker alone changes the displayed state.
Export writes 28 PNGs (14 states in both appearances), named
`<preview-name>-iPad-<light|dark>.png`, at 1194 × 834 pixels over the backdrop.

`PreviewKit` provides `PreviewWindow` (content over a backdrop on the left,
controls, appearance and events on the right), `PreviewDeviceSize` dimensions, and
`PreviewExporter`. To add an app, give it an executable target depending on
`PreviewKit` and the feature's products. Supply one named `PreviewSnapshot` per
state to the exporter; it renders each on both devices in both appearances
unless the app supplies a smaller `devices` list.
There are no tests in this package; compare the exports with the design.

## What a preview app holds

A preview app runs the real view. `ModeSwitchPreview` holds the chosen mode
and the stand-in screens' tap counts. `HostPreview` holds only the preview
selection and event log: it runs no flow or machine. Named presentation states
supply its picker and exporter. Preview apps copy no feature code. Driving a
screen with its real machines and external dependencies stubbed is later work.
