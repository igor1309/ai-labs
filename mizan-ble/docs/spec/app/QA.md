# App — QA

Driven on a real iPad and iPhone with the log streamed from Console; a
row reads the log lines.

## S-1 Each mode wires its own radio

Launch on the iPad: the log names the host radio built, and no client radio. Evidence: Missing.

## S-2 A switch tears the old mode down

Switch at rest: the host radio's stop is logged before the client radio's start. Evidence: Missing.

## S-3 Every message is logged without its contents

A payment from lock through confirm to a success result: each message logged with kind, counter and length; no amount or key. Evidence: Missing.

## S-4 Every state change is logged

A payment from lock through confirm to a success result: each flow's states in order. Evidence: Missing.

## S-5 A hand-over builds the next flow

A handshake: client find logged handed over, not ended; client connect ended; client review built with the same session id. Evidence: Missing.
