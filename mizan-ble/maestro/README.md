# Maestro lanes

A lane rehearses one user scenario against ScriptedRadio. Each `lane.json`
names its parts: a flow, settings, device kind and category/phase log lines.
Parts use independent fresh clones; the two sides play against scripts.

From the repository root:

```sh
mizan-ble/maestro/run.sh                 # all 15 lanes, in order
mizan-ble/maestro/run.sh S-1 S-10         # ids or full directory names
mizan-ble/maestro/run.sh --keep S-7       # retain failed clones for inspection
```

Requires Xcode with an iOS simulator runtime and Maestro 2.12.0 on PATH.
The runner builds `MizanBLE Rehearsal` once, keeps its build and module
caches under `ios/.build/lanes`, and creates or reuses `Mizan Lanes iPhone`
and `Mizan Lanes iPad` bases on the newest installed iOS runtime. It only
boots and removes its own clones. Settings go into the clone's app container
at `Documents/scripted-radio.json`; no flow clears state on launch.
`enteredAmount` is lane metadata for the host keypad's amount in minor units;
ScriptedSettings ignores it while the log checker includes it.

S-11 switches from the resting host to a client payment. S-12/13 open both
modes on one device. S-14 changes the countdown in Settings before stopping
and relaunching. S-15 has one iPad part per Examples row: it first reads the
operator's state, returns to rest, then switches to the payer screen to read
that side's failure against the matching scripted host.

Each run writes `runs/YYYY-MM-DD-HHMM.md` incrementally, with commit and dirty
status, Xcode, runtime, Maestro and app build pins. Part rows give overall,
flow and log-check results, duration and an end-screen screenshot. The sibling
folder holds screenshots, build output, flow output, logs, checker output and
any air capture; it is ignored by git. The Markdown report is kept. A setup
failure leaves a blocked report. A failed part skips the rest of its lane; the
other lanes still run, and its Maestro output keeps the failing step. Exit codes: 0 pass, 1 failure,
64 usage. `--keep` reports the failed clone's identity; otherwise all clones
are removed on success, failure or interruption. A minute's report is never
overwritten; start a later run in a new minute.

The stdlib checker rejects missing category/phase lines, logged amount
representations, also next to punctuation, and long hex/base64-shaped
strings. Public byte counts and
counters do not count as amount leaks. S-10 also checks its actual captured
frames, requiring the session read, the key write, and amount, decision,
acknowledgement and result traffic. It
computes amount bodies as unsigned eight-byte big-endian integers and
confirm/decline and success/failure bodies as 1/2 from the codec's layout.
Binary amounts are searched throughout every frame. Decision/result bodies
are checked as whole plaintext frames (kind, counter, body), or bare bodies:
a single 1/2 byte inside a random key, nonce or ciphertext cannot identify a
plaintext decision. Capture hex itself is allowed to contain long runs; it
is the wire data under inspection, rather than an application-log leak.

CI runs the Python helper tests and Swift recorder tests. It does not run
Maestro lanes yet. A full local run needs access to CoreSimulator.
