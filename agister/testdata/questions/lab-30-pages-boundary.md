# Question

Asked by: code_review workflow run 20261001T110759Z-095212, item "Pages reads run evidence directly instead of through the client contract" (owner, major).

Question: does ADR-001 rule 15 govern the pages server? Options: (a) yes, so in this change, give pages an adapter over the client's read capabilities and extend the contract with raw-record and listing data, keeping summary formatting in pages; (b) yes, but move both the settings and runs bypasses to deferred work as one boundary task; (c) no, so record pages as an explicit exception in ADR-001.
