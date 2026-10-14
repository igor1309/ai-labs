# LAB-17: a workflow waits until its child's final record is saved

A review finding, never ruled on; line numbers are from when it was raised
and may have moved. Confirm it in the code before fixing; if it does not
hold, say so and change nothing.

In `agister/internal/app/calls.go`, a finished child call is marked
completed and its final record assigned before the record is saved, and
the error from `handle.Finish` is discarded. When that save fails (e.g.
the child's run directory becomes unwritable), `fsruns` releases the
child's ownership and leaves its last unfinished record on disk, which
later reads as abandoned. The workflow still gets the in-memory record
as completed: the barrier passes and the join runs on output whose saved
record says otherwise, and the parent completes successfully.

A child's outcome must reflect a failed final save: the workflow does not
treat that child as completed, so a barrier that needs it does not pass
and the join does not run on its output. Decide the child's resulting
status and error class from what the code already uses for persistence
failures, and keep the parent's own record consistent with what happened.

Prove it with a regular test through a seam (a run store whose Finish
fails for one child), not by making a directory unwritable.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
