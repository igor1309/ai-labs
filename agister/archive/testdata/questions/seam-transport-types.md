# Supervisor seam: Transport interfaces expose supervisor-owned Spec, Sink and Evidence instead of consumer-owned types

Review run 20261002T045050Z-bc3aac ruled this item for the owner.

Finding (major): Transport interfaces expose supervisor-owned Spec, Sink and Evidence instead of consumer-owned types

Question: Question: should each runtime adapter own its transport contract, with supervisor adapters translating in main.go? Options: (a) declare consumer-owned Spec/Sink/Evidence equivalents in claudecode, codex, pi and opencode, add translating adapters at the composition root, and move the spy tests to the new contracts; (b) accept supervisor.Spec/Sink/Evidence as the shared process contract for the runtime adapter family and record that exception to the ownership rule in decisions.md.

Judge's reasoning: The trace is complete and the change introduced it. Line references show all four new Transport interfaces (claudecode:60, codex:65, pi:104, opencode:129) and the runtimetest spy (:371) using supervisor.Spec, Sink and Evidence. main.go:143–155 wires the supervisor in with no translation. That breaks the stated rule that each component owns its dependency types. The finding, though, calls for a new mechanism: four sets of consumer-owned request, result and callback types plus translating adapters at the composition root. The only case it shows is structural coupling, not a failure. Whether the runtime adapters and the supervisor beside them count as separate components that need translation, or one family sharing a single process contract, is a stance only the owner can take. The owner already chose one change for all four adapters.

Answer with one of the options and why, or "owner" if this needs the
owner's decision.
