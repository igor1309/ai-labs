# Client find — QA

Driven through its reducer as tables, and through the machine with a fake
scanner. Picker answers and Bluetooth states are events the test sends.
Rows read the state and what the scanner fake recorded.

## S-1 No host nearby

Scanning, picker none: the state reads no host, start refused. Evidence: Missing.

## S-2 A host is chosen

Scanning, picker MIZAN-7F3A: the state reads MIZAN-7F3A, start offered. Evidence: Missing.

## S-3 No clear nearest host

Scanning, picker hold closer: the state reads hold closer, start refused. Evidence: Missing.

## S-4 The chosen host goes quiet

MIZAN-7F3A chosen, picker none: the state reads gone, start refused. Evidence: Missing.

## S-5 Starting the handshake

MIZAN-7F3A chosen, start: the scanner fake stopped; the state reads handed over MIZAN-7F3A. Evidence: Missing.

## S-6 Back to scanning

Handed over, transaction over: the scanner fake started; the state reads scanning, no host. Evidence: Missing.

## S-7 Bluetooth is not available

Scanning, unauthorized: the state reads not allowed, start refused. Evidence: Missing.

## S-8 Bluetooth comes back

Unauthorized, then on: the state reads scanning, no host. Evidence: Missing.
