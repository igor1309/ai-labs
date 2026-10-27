# Design system — QA

Driven by the token generator's own tests and by snapshot tests of each
component against the design's exported previews.

## S-1 A token in the design is a token in code

A token changed in a fixture snapshot: the generated Swift holds the new value, and the check passes. Evidence: Missing.

## S-2 A stale token file is caught

A fixture snapshot newer than the Swift: the check exits 1. Evidence: Missing.

## S-3 Every component is a view

Each `DS /` component in the design: a view of the same name exists, taking its overrides. Evidence: Missing.

## S-4 An amount with the Mizan sign

The amount view at XL: a snapshot matches the design's export of DS / Amount / XL. Evidence: Missing.

## S-5 A component matches its frame

Each component at its sample values: a snapshot matches the design's export. Evidence: Missing.
