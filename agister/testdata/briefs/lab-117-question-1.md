# LAB-117 question 1

## Asked by

The judge of `code_review` workflow run `20261007T084631Z-5dedb2` (LAB-117 review round 2), its `owner` item "A long request param is replaced by its digest before its bytes are stored, so a refusal loses it".

## Question and options

Question: how should a long param's bytes survive a run that is refused before its inputs are recorded? Options: (a) delay redacting request.params until matching evidence is kept, and keep the original request on refusal paths; (b) store each long param as an artifact on its own before redacting it in Submit and startNode; (c) accept that a refused run keeps only the digest, and record that decision. Whichever is picked, add a regular test: a long goal param followed by a failing file input.
