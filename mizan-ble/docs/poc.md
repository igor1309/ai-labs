# Mizan BLE

Low-energy Bluetooth proof of concept 

## v0.0.1
One app, two modes:
- Host (use iPad)
  - Enter amount (decimal number pad)
  - Confirm amount => hide number pad, starts advertising and 60 sec countdown (Settings)
  - On countdown expiration reset state: stop advertising, reset amount, etc
  - Handshake/exchange - BLE - render result: success or failure
  - On client decline - end transaction
  - On client confirm - mock payment processing with 2 buttons: success and failure
  - Display result
- Client (use iPhone)
  - Start handshake/exchange - render ui state
  - Failure - stop
  - Success: show amount, 2 buttons: confirm & decline
  - On decline - notify Host; stop
  - On confirm - notify Host
  - Acknowledgement
  - Waiting for host response
  - Render host response; failure or success

### Design
- Switch/selector/segmented picker or other visual - clear distinction of two modes
- Mizan currency symbol - see blackchain project in Cortagora repo

## v0.1.0
App in foreground but no explicit handshake.

## v0.2.0
No app in foreground - is it even possible?
App extension? App intent?

## Android
??

## Research
Tech solutions
- СБЕР ВЖУХ
- НСПК
- Apple Pay
- Google Pay
- Other