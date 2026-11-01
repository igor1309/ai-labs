# LAB-123 question 1

## Who asked

The judge of `code_review` workflow run `20261007T211031Z-931f60`, item 5#1 ("Legacy directory overlaps are refused without synchronous reaping, so the goal's scope is unclear"), ruled `owner`.

## Question

Question: does Done when 1 cover unfinished legacy runs whose removable checkout or copy directory overlaps the call, when their owner lock is free? Options: (a) narrow reading: keep the ADR-025 removable-directory refusal and clarify the goal wording; (b) broad reading: reap such runs synchronously before deciding, which needs a separate assessment of directory-removal safety and a notes entry recording the departure from ADR-025.
