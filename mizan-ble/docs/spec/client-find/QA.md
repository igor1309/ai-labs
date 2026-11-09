# Client find — QA

Driven through its reducer as tables, and its effect handler with a fake
scanner. Host choice's answers, signals and Bluetooth states are events the test sends.
Rows read the state and what the scanner fake recorded.

## S-1 No host nearby

Scanning, host choice none: the state reads no host, start refused. Evidence: `ClientFindTests.noHostNearby`.

## S-2 A host is chosen

Scanning, host choice MIZAN-7F3A: the state reads MIZAN-7F3A, start offered. Evidence: `ClientFindTests.aHostIsChosen`.

## S-3 No clear nearest host

Scanning, host choice hold closer: the state reads hold closer, start refused. Evidence: `ClientFindTests.noClearNearestHost`.

## S-4 The chosen host goes quiet

MIZAN-7F3A chosen, host choice none: the state reads gone, start refused. Evidence: `ClientFindTests.chosenHostGoesQuiet`.

## S-5 Starting the handshake

MIZAN-7F3A chosen, start: the scanner fake stopped; the state reads handed over MIZAN-7F3A. Evidence: `ClientFindTests.startingTheHandshake`.

## S-6 Back to scanning

Handed over, transaction over: the scanner fake started; the state reads scanning, no host, no signal. Evidence: `ClientFindTests.backToScanning`.

## S-7 Bluetooth is not available

Scanning at −58 dBm, unauthorized: the state reads not allowed, no signal, start refused. Evidence: `ClientFindTests.bluetoothIsNotAvailable`.

## S-8 Bluetooth comes back

Unauthorized, then on: the state reads scanning, no host. Evidence: `ClientFindTests.bluetoothComesBack`.

## S-9 A host with no name yet

A host chosen with no name, then a reading with its name: the state names no host, then that name. Evidence: `ClientFindTests.aHostWithNoNameYet`.

## S-10 The signal while scanning

Scanning, signals −70 then −58 dBm, under each of none, hold closer, a host and gone: the state reads live −70, then live −58; selection and start stay as host choice left them. Evidence: `ClientFindTests.signalWhileScanning`.

## S-11 The signal at the start

MIZAN-7F3A chosen at −62 dBm, a −58 reading, start; then during the stop and after the handover a −80 reading, no signal, and Bluetooth off: the state reads −58 at the start throughout. Evidence: `ClientFindTests.signalAtTheStart`.

## S-12 No host heard

Scanning at −58 dBm, then no signal: the state reads no signal. Evidence: `ClientFindTests.noHostHeard`.
