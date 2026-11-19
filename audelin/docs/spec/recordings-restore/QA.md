# Recordings — restoring the previous transcript — QA

An async machine: each row is reducer cases with the effect each event
asks for, paired with effect tests for the same state and event. Message
formatters are spies: not called on init or when nothing is refused, called
once per refusal with the exact payload, their stub text the reason in the
state. Ports are spies whose completions are delivered as result events; a
fresh listing is a distinct fake listing whose contents and selection are
asserted. A row without evidence is Missing.

## S-1 Restoring asks Calls

Offered, restore: restoring; the restore port asked for that call.
Evidence: Missing.

## S-2 A restored call lists again

Restoring, restored: no action; a distinct listing arrives and the call is selected; the transcript-changed output names the call.
Evidence: Missing.

## S-3 A failed restore is named

Restoring, failed: no action, the call selected, the reason kept; no list effect.
Evidence: Missing.

## S-4 Nothing starts during a restore

Restoring, each of rename, delete, merge, move, run: no effect; each reason.
Evidence: Missing.
