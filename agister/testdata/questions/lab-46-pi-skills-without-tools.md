# Question

Asked by: code_review workflow run 20261001T143449Z-f65c50, item "Pi calls run without repository skills when the plan has no read or bash tool" (owner, major).

Question: what should happen when a Pi plan cannot include a skill-reading tool? Options: (a) refuse the plan in a runtime preflight, as the reviewer proposes, and replace TestNoToolsAndDefaults with a refusal test; (b) change the Pi example or service settings so a skill-reading primitive is grantable, keeping ADR-006 literally; (c) accept tool-less Pi calls without skills and record that as an exception to ADR-006.
