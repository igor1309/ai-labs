# Log

## 2026-10-30

- On an iPhone every screen's actions sit in one shared footer and use one shared action button, so a tall screen no longer moves its header or button; host and client line up to the pixel on a 6.1-inch iPhone (LAB-728).
- On an iPhone the host's action button sits at the foot of the screen like the client's, and its screen no longer scrolls, so the header holds the same place on both sides (LAB-728).
- v0.0.1 is built: payments confirm, fail and decline on a real iPad and iPhone, with the signal values measured there and no secret in the log (LAB-728).
- Switching between host and client swaps the screen at once, instead of fading one full screen over the other (LAB-728).
- The screens lay out inside the safe area on every device, with only their backgrounds reaching the screen's edges (LAB-728).
- On an iPhone the host's header clears the status bar, and both sides keep clear of the status bar and home indicator; the client's detail keeps its two lines (LAB-728).

## 2026-10-29

- The host's screens now fit an iPhone, edge to edge like the client's, so a phone switched to Host can switch back (LAB-728).
- The client log now says that the picker chose a host or asked to hold closer, with the signal it saw (LAB-728).
- The client's screens before the amount keep one layout, so a change of state no longer moves the rings or text; hold closer and Bluetooth off use the design's copy, one line per Bluetooth reason (LAB-766).
- The design gives the client's screens before the amount one layout, so a change of state moves nothing, and draws hold closer and Bluetooth off (LAB-765).
- On a device the screens fill the display to its edges, with no inset rounded outline or black margins.
- Every payment scenario has a simulator rehearsal lane, with screen, log and encrypted-air checks (LAB-726).
- On an iPad in portrait, settings opens full screen and its countdown can be chosen again, and the host's amount shows whole (LAB-726).

- The app has its designed icon, two beacons and the Mizan sign, with a
  Liquid Glass edition (LAB-742).

- Screens now animate between states (LAB-741).

- The client side pays end to end in the app (LAB-725).

- The rehearsal app plays the other side from a settings file (LAB-723).

- The host side takes a payment end to end in the app (LAB-724).

- The app launches with the mode switch and logs (LAB-722).

## 2026-10-28

- ClientRadio supplies nearby host readings, connects through the GATT setup, writes keys and messages with responses, and reports host messages and lost links (LAB-661).
- HostRadio serves and advertises a session, accepts its owner's writes, queues messages for that owner, and retires or finishes the service while reporting Bluetooth and link changes (LAB-660).
- The flows hand each effect's results back as a stream and run on swift-imrx's `ObservableModel` in the app; the package's own machine is gone (LAB-693).
- SystemClock supplies monotonic instants, deadline-based countdowns and periodic ticks that stop when their reader is cancelled (LAB-658).
- HostBroadcast takes a locked amount through advertising and the handshake to a secure link, with a countdown, cancellation, retry and a fresh amount after payment; the session protects the amount before it is sent (LAB-652).
- ClientConnect opens a secure link to the chosen host and hands over its amount, with cancel, retry after a failure and a 10-second handshake deadline (LAB-655).
- ClientReview shows the handed-over amount, carries the payer's decision to the host's acknowledgement and hands over an acknowledged confirm, with clear cancelled and lost-link outcomes (LAB-656).
- ClientPayment lets the payer read the host's payment result or a lost link with an unknown result, then finish the transaction (LAB-657).
- ClientFind offers the chosen nearby host, stops scanning before handing it over for payment, and resumes scanning when the transaction ends (LAB-654).
- HostPayment takes the client's decision through the operator's mock result, acknowledges decisions, and ends cancelled or lost-link payments before a new amount (LAB-653).
- Preferences stores numbers and text in a named suite and reads them back across instances, with unwritten keys reading as nothing (LAB-659).
- An effect starts before the next event is reduced, so a flow never has to check whether its effect is still wanted (LAB-683).

## 2026-10-27

- HostPreview lets the operator inspect every host screen and its events, and export iPad PNGs in light and dark for comparison with the design (LAB-676).
- SettingsPreview lets the operator inspect every iPad settings state, log taps and export light/dark PNGs for comparison with the design (LAB-677).
- ClientPreview lets you inspect every payer find/connect state, log its actions and export iPhone PNGs in light and dark for comparison with the design (LAB-678).
- ClientPaymentPreview lets you select every payer review and result state, inspect its events and export iPhone PNGs in light and dark for comparison with the design (LAB-679).
- SettingsUI gives the operator countdown choices with a full-ring preview and shows the advertised name, currency and processor read-only (LAB-672).
- ClientUI gives the payer find and connect screens for nearby tills, connection progress and failures, with start, cancel and retry actions (LAB-673).
- HostUI gives the operator an amount pad, broadcast countdown, connection and payment screens, with controls for cancelling, retrying and picking the mock result (LAB-671).
- ClientPaymentUI gives the payer amount review, confirm and decline progress, the host's result and clear cancelled or lost-link outcomes (LAB-674).
- ModeSwitchUI shows the chosen host or client screen with its header switch dimmed during a payment (LAB-670).
- ModeSwitchPreview lets you try both device shells and compare every switch state in light and dark as device-sized PNGs (LAB-670).
- AmountEntry keeps the keypad's typed amount within six whole digits and two decimals, and allows locking a positive amount only while Bluetooth is available (LAB-651).
- HostPicker chooses a clear nearest host from smoothed signal readings, asks to hold closer when uncertain, and forgets faded hosts (LAB-650).
- SessionCrypto derives a fresh transaction key, seals and opens authenticated messages, and refuses replays and messages after closure (LAB-649).
- MessageCodec encodes and decodes session characteristics, sealed frames and message bodies, refusing unreadable bytes (LAB-648).
- Settings supplies validated countdown and picker values with defaults, and keeps the till's advertised name across reads (LAB-647).
- Machine runs reducers in order, carries out independent effects and delivers each state change to every subscriber (LAB-646).
- The tokens are generated straight from the design file, and CI fails
  when the design and the app's tokens differ; the hand-made snapshot is
  gone.
- Specified v0.0.1: the architecture names the components, each with its
  own spec, and the Bluetooth layout. Each side runs a chain of flows to
  a secure link and then to the result; the client picks the nearest
  host and never guesses. The host's countdown stops once the amount is
  sent, a host cancel reaches the payer as a sealed end message, and
  a link lost after a confirm shows the payer "result unknown". The
  architecture is SOLID by composition, with each component's contracts,
  and weighs an outside candidate (LAB-626).
- The rest of the design system in the module: named type roles, the
  status pill, the host rail and client stepper, device chips, messages and
  the exchange strip, keypad keys, and the iPad and iPhone screen shells
  (LAB-634).
- A light appearance: every design system colour has a light value, and
  the app's components follow the device's light or dark setting (LAB-633).
- The design system module: the design's tokens, generated from a snapshot
  of the design file, the bundled fonts, the Mizan sign, and the buttons,
  amount, countdown, mode header and result card the screens are built
  from (LAB-627).
- Design: the design system is locked, with host orange and client blue and
  the mode switch in every header; paired host and client frames cover the
  flow; the Mizan sign is a turned M with a tail and two bars; earlier
  designs moved to an Explorations area (LAB-612, LAB-613, LAB-614).
- Decided: the client picks the nearest host by smoothed signal strength and
  never guesses between two close ones, and every message after the
  handshake is encrypted with a key made for that one transaction. Both
  are in v0.0.1; a 4-digit match against fake tills comes later.
- Research: Sber's «Вжух» pays over BLE with the iPhone as central and the
  terminal as peripheral, choosing the nearest terminal by smoothed RSSI and
  sending an encrypted token in GATT fragments; the terminal goes online, so
  the phone need not. The same roles fit mizan-ble's client and host
  (LAB-623).
- Project started: a two-mode iOS app, an iPad host and an iPhone client,
  that agree a Mizan payment over Bluetooth LE. v0.0.1 is planned with both
  apps in the foreground and a mocked payment; v0.1.0 and v0.2.0 are to find
  how far iOS lets the handshake and the foreground app go.
