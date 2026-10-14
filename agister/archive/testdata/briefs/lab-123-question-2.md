# LAB-123 question 2

## Who asked

The judge of `code_review` workflow run `20261007T211031Z-931f60`, item 5#2 ("Ambiguous whether a process left by the per-run reap refuses the call or is retried first"), ruled `owner`.

## Question

Question: when the per-run reap leaves a process not known to have ended, should the call (a) still go through the holder's existing process retry and be admitted if the retry ends the process (current behaviour, clarify the goal wording), or (b) be refused based on the per-run reap's result alone?
