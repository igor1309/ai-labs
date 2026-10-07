# LAB-122 question 3

## Who asked

The judge of `code_review` workflow run `20261007T135259Z-b3ec12`, item
5#2 ("`check --json` exposes the unknown marker but not the newer-binary
hint"), ruled `owner`.

## Question

Question: does 'Every refusal shows it' cover `agister check --json`? Options: (a) keep today's split, where JSON check carries only the Unknown marker: confirm it in the goal, with no code change; (b) all outputs: have the JSON check path also print the newer-binary hint (for example on stderr, leaving the stdout JSON contract alone) and add a regression for `check --json` using t.TempDir() settings.
