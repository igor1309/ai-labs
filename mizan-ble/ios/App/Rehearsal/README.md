# Rehearsal settings

Build and run the `MizanBLE Rehearsal` scheme on an iPhone or iPad simulator.
Pass `-scriptedRadio /absolute/path/to/settings.json` in the scheme's launch
arguments. Without it the app reads `Documents/scripted-radio.json` inside
its container. The shell displays the mode switch; transaction screens
will use these radios when their flows are wired.

The file is JSON. Omit any field to use its default; `{}` enables Bluetooth,
a confirming client, and one successful host offering 12345 minor units.
Amounts are unsigned whole minor units. Delays and reading times are finite,
nonnegative seconds; reading times are relative to scan start, while event
timestamps use the clock's current time. RSSI is an integer.
The directory must exist before launch; the file may be created later and
may be replaced atomically. Changes update Bluetooth immediately; each serve
or scan keeps its own settings until the transaction ends.

Every field is illustrated here, with its default value:

```json
{
  "bluetooth": "on",
  "client": {
    "comes": true,
    "decision": "confirm",
    "drop": null,
    "delays": {
      "connect": 0.1, "key": 0.1, "amount": 0.1, "decision": 0.1,
      "acknowledgement": 0.1, "outcome": 0.1, "end": 0.1, "drop": 0.1
    }
  },
  "hosts": [{
    "name": "MIZAN-CAFE",
    "readings": [{"time": 0, "rssi": -40}],
    "amount": 12345,
    "cancelsAfterAmount": false,
    "outcome": "success",
    "drop": null,
    "delays": {
      "connect": 0.1, "key": 0.1, "amount": 0.1, "decision": 0.1,
      "acknowledgement": 0.1, "outcome": 0.1, "end": 0.1, "drop": 0.1
    }
  }]
}
```

`bluetooth` is `on`, `off`, or `notAllowed`; `decision` is `confirm` or
`decline`; `outcome` is `success` or `failure`. An empty `hosts` array gives
no readings. Each host has a stable identity during that scan. Settings
make fresh keys for every transaction.

The scripted client uses `connect` plus `key` before its key, `decision`
before writing its decision, and `drop` before a configured loss. It opens
the app's amount, acknowledgement and outcome as they are sent. For example,
`"client": {"decision": "decline", "delays": {"decision": 2}}` waits two
seconds before declining. Client drop points are:

| `client.drop` | What the host sees |
|---|---|
| `beforeKey` | No key and no loss |
| `afterKey` | Key, then loss before an amount |
| `afterAmount` | Loss after opening the amount |
| `afterDecision` | Decision, then loss |

A scripted host uses `connect` before connection, `key` before answering
the key write, `amount` before delivering its sealed amount,
`acknowledgement` before its acknowledgement, `outcome` before its result,
`end` before cancelling, and `drop` before a configured loss. For example,
`"hosts": [{"amount": 9900, "outcome": "failure", "delays": {"outcome": 3}}]`
asks for 9900 minor units and reports failure three seconds after acknowledging
a confirm. Host drop points are:

| `hosts[].drop` | What the client sees |
|---|---|
| `beforeKey` | Connection, then loss before the key |
| `beforeAmountArrives` | Key answered, amount sealed, loss before delivery |
| `afterAmount` | Amount, then loss |
| `afterAcknowledgement` | Acknowledgement, then loss before the result |

Missing or invalid files make both radios unsupported; the log records only
`missing` or `invalid` in category `rehearsal`. It never records file text.
Writing a valid file restores Bluetooth's configured state.

The files in `examples/` cover confirmed success and failure, decline,
operator timeout, nearest and ambiguous hosts, handshake loss, cancellation,
loss during payment, either role, Bluetooth off and not allowed, the operator's
countdown, and both phone-only handshake failures. Host and client variants
play their respective other side. The host's result choice, the client's
decline, mode switching, and countdown preferences are actions in the app;
their files provide the other side. A recorded Bluetooth-air confidentiality
check requires real devices and has no scripted example.
