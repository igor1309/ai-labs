# Supervisor seam review round 1 fixes

Review rulings (code_review run 20261002T045050Z-bc3aac) and the owner's
decision on one of them. Make each change with its tests.

## 1. Transport interfaces expose supervisor-owned Spec, Sink and Evidence instead of consumer-owned types (major; owner: adapters own the types)

The owner chose option (a): declare consumer-owned Spec/Sink/Evidence equivalents in claudecode, codex, pi and opencode, add translating adapters at the composition root, and move the spy tests to the new contracts.

Each of `claudecode`, `codex`, `pi` and `opencode` declares, in its own
package, the request, event sink and result types its transport takes,
with only the fields it uses. The composition root (`cmd/agister`)
translates between each adapter's types and the supervisor's. The spy in
`runtimetest` and the adapter tests move to the adapters' own types. Keep
behaviour identical. The adapters may still call the supervisor's pure
helpers only if those take no supervisor-owned type across the seam;
otherwise move what an adapter needs behind its own types too, and say
in your report what you did and why.

Why: The trace is complete and the change introduced it. Line references show all four new Transport interfaces (claudecode:60, codex:65, pi:104, opencode:129) and the runtimetest spy (:371) using supervisor.Spec, Sink and Evidence. main.go:143–155 wires the supervisor in with no translation. That breaks the stated rule that each component owns its dependency types. The finding, though, calls for a new mechanism: four sets of consumer-owned request, result and callback types plus translating adapters at the composition root. The only case it shows is structural coupling, not a failure. Whether the runtime adapters and the supervisor beside them count as separate components that need translation, or one family sharing a single process contract, is a stance only the owner can take. The owner already chose one change for all four adapters.

## 2. CCUsage uses Runner's Run+Version Transport but only needs Run (minor)

Action: Declare a separate execution-only dependency next to CCUsage, or accept an injected execution function. The real supervisor can fill both roles. Keep the standalone CCUsage timeout and signal tests, now using a Run-only spy.

Why: The trace is concrete and the change introduced it. codex.go:106 gives CCUsage the shared Transport, defined at :64 with Run and Version. The trace shows CCUsage calls only Run (:109) and never Version through :131. The standalone CCUsage test (transport_test.go:119) still needs a spy that implements Version (runtimetest.go:386). The ADR lines cited (001:245, 246, 252) require each consumer to depend only on the capabilities it uses, apply that rule recursively, and prohibit shared interfaces.

The owner's other ruling: item 3 stays removed from `docs/deferred.md`;
nothing else records the decision.

Run the full check from `agister/` (its AGENTS.md) and `node --test
pages/tests/*.test.js` from `agister/`. Report each command with its exit
code and final line, and list every file you changed.
