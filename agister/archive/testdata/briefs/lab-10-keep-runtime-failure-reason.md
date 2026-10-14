# LAB-10: keep a runtime's failure reason

When a runtime process exits non-zero, the record says only
`runtime_error: exit code N`; the runtime's own reason is lost. Seen: four
Codex reviewers failed on a 1.4 MB diff; Codex said "Input exceeds the
maximum length of 1048576 characters" (`input_too_large`), and Agister
recorded `exit code 1`. Finding the reason took a manual rerun.

- A failed call's evidence keeps a bounded tail of the runtime's stderr;
  stderr beyond the bound is cut, and the evidence says so.
- The call's error message quotes the runtime's reason when there is one.
  Where a runtime reports its reason in its event stream rather than on
  stderr, use that too; check what the installed `codex` and `claude` do.
- Status and error class stay as they are. A runtime that prints nothing
  keeps today's `exit code N`.

Regular tests with a fake runtime that prints a reason and exits non-zero
prove the record's error message and evidence carry the reason, the bound
and its marker, and the silent case.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
