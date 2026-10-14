# LAB-122 question 2

## Who asked

The judge of `code_review` workflow run `20261007T133639Z-3a35ad`, item
5#1 ("Whether a known field with a non-scalar value (e.g. `path: {from:
brief.md}`) gets the hint is an open reading"), ruled `owner`.

## Question

Question: for an input argument this binary knows (such as file's `path`) given a non-scalar value, should the problem be marked unknown and show the hint, or stay ordinary? Option A, shape-first: keep the current behaviour and record the decision in the goal. Option B, known-field-first: make it ordinary, and change the parser, the definition tests, the CLI tests and the docs to match.
