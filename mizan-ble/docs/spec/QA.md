# Mizan BLE — QA

Driven on a real iPad as the host and a real iPhone as the client, both in
the foreground, as the owner runs them. A row reads back what each screen
shows. Evidence is a run report with each screen's screenshot.

## S-1 A confirmed payment that succeeds

Lock 124.50, start the handshake, confirm, pick success: both screens show
124.50 paid. Evidence: Missing.

## S-2 A confirmed payment that fails

Lock 124.50, start the handshake, confirm, pick failure: both screens
show the payment failed and the iPhone says it was not charged. Evidence: Missing.

## S-3 A declined payment

Lock, start the handshake, decline: both screens show it declined and the
iPhone says it was not charged. Evidence: Missing.

## S-4 A host left alone times out

Countdown set to 15 s, lock, wait: the iPad is back on amount entry with
the amount cleared, and the iPhone shows the host went quiet with no
handshake to start. Evidence: Missing.

## S-5 The nearest host is the one paid

A second iPad or iPhone as a second host, one at arm's length and one
beside the phone: the phone names the one beside it. Evidence: Missing.

## S-6 Two hosts too close to call

Both hosts beside the phone: it asks to hold the phone closer and offers no
handshake. Evidence: Missing.

## S-7 A handshake that breaks off

Start the handshake and cancel on the iPhone while the iPad still shows
the handshake running: both screens show the handshake failed; Broadcast
again on the iPad lets the payer start a new handshake. Evidence: Missing.

## S-8 The operator cancels

With the amount on the iPhone, cancel on the iPad: the iPhone shows the
host cancelled and not charged. Evidence: Missing.

## S-9 The link drops while the payment is processed

Confirm, then switch the iPhone's Bluetooth off before picking an outcome:
the iPhone shows the result unknown and the iPad that the payer was not
told. Evidence: Missing.

## S-10 The amount never crosses the air in the clear

An nRF Sniffer with Wireshark records a payment of 124.50 from lock to
success: no value in the recording
holds 124.50 in any encoding the codec uses, and each message differs from
the last run's.
Evidence: Missing.

## S-11 One device, either role

After a paid payment, switch each device's mode: a payment of 124.50 runs
to success with the iPhone as host and the iPad as client. Evidence: Missing.

## S-12 Bluetooth off

Bluetooth off in Control Centre on one device: each mode there says
Bluetooth is off and offers no lock or handshake. Evidence: Missing.

## S-13 The countdown is the operator's to set

Set 30 s, quit and relaunch, lock: the ring starts at 30. Evidence:
Missing.

## S-14 Bluetooth not allowed

Mizan BLE switched off under Settings › Privacy & Security › Bluetooth on
one device: each mode there says Bluetooth is not allowed and offers no
lock or handshake. Evidence: Missing.

## S-15 A link lost with the amount on its way

Too short a window to hit by hand on two devices; read each side's fixture
for it instead: the iPad shows the link lost with nothing charged and New
amount, the iPhone that it could not connect. Evidence: Missing.
