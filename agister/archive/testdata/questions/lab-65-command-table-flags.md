# Who asked

The judge of code_review run 20261006T062639Z-6ae9d0, item 2#2 ("Guard's flag catalog is not checked against the parser's actual flag registrations"), ruling `owner`, on LAB-65.

# Question and options

Question: how should the command table and the parser's flag registrations be kept in agreement? Option A: add an invariant test that every flag in each `Commands()` entry is accepted by the real parser registration. Option B: derive both the table's flags and the FlagSet registrations from one source in cli.go, so they cannot differ. Option C: waive, accepting that a table typo would be caught at runtime by the parser's usage error.
