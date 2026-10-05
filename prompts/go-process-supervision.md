---
date: 2026-10-05
author: Igor Malyarov
model: claude-opus-5-5
name: Go — process supervision
version: 0.0.1
type: prompt
---

Applies to Go that starts child processes on Unix (Linux, macOS) and must
end them: a CLI it drives, a `bash -c` command, anything that may hang,
flood its output or leave children behind. Skip it for code that starts
no process.

A child is yours until nothing of it runs. Every rule below closes one
way for a process, or what it started, to outlive the call that owns it.

A process group per child

* Start the child as the leader of a process group of its own
  (`SysProcAttr{Setpgid: true}`), and signal the group, `syscall.Kill(-pid,
  sig)`, never the process alone. A kill of the leader, which is all
  `exec.CommandContext` does, leaves whatever it started running.
* Never signal group 0, 1 or below: that is your own group or every
  process.
* Give the child's stdout a plain `os.Pipe`, not `StdoutPipe`, and close
  your writing end after the start. `Wait` then returns when the process
  exits, not when every holder of its stdout has let go, and the output is
  read by a goroutine apart from the exit.

Ending it

* On a timeout or a cancelled context: SIGTERM to the group, a grace
  period (5 s is a workable default), then SIGKILL to the group if it has
  not exited. A command with nothing to save is killed at once.
* Say which one ended it: timed out, cancelled, or without output for too
  long are results of their own beside the exit code and the signal, and
  the supervisor's decision is recorded apart from what the process did.
* A context that has ended already starts nothing.
* Signal the group only while it is known to exist. Once the leader has
  been waited for and the group is empty, its ID may be reused: the
  watcher that fires late checks, under the lock `Wait`'s caller takes,
  that the process is not reaped yet.

What the child left running

* Right after `Wait` returns, SIGKILL the group once more, under that same
  lock. A group outlives its leader while members remain, and its ID is
  not reused while it exists; `ESRCH` means it was empty. A kill that
  succeeds found leftovers: report it.
* A descendant that left the group can still hold the output open. Read
  stdout for at most the grace period after the exit, then close the
  reading end and report that it was held. Bound the copying of stdin and
  stderr after the exit the same way (`WaitDelay`).

A process whose owner was killed

* Put the group on record before anything else, first as the group alone,
  then with its token (below): from the start on, the group can outlive
  you. A group that cannot be recorded is killed at once, while its ID is
  still yours. Nothing runs that no record leads back to.
* A later run reaps what a killed owner left: it kills the recorded group
  unless a live process holds that ID and is not the recorded one.

Telling a reused PID apart

* The token of a process instance is its start time and command name, as
  `ps -o lstart=,comm= -p <pid>` prints them under `LC_ALL=C`. A process
  that reuses the ID started at another time or runs another command.
* Reaping a recorded group: a live process with another token, or any live
  process when no token was recorded, is left alone and reported as left.
  With no live process of that ID, kill the group anyway: members that
  remain keep its ID from reuse, and `ESRCH` means it is gone.
* How far that goes: it is best effort. `lstart` has one-second
  resolution, so the same command reusing the ID within that second is not
  told apart, and a sandbox may refuse `ps` altogether. Prefer leaving a
  process to killing a stranger.

Bounded capture

* Output has no upper limit; what you keep does. Of the combined output
  keep the first N bytes, the last N bytes after them (so nothing is
  repeated), the size of the whole and a digest of the whole (SHA-256).
  The head shows how it began, the tail why it failed, and the digest
  identifies the rest.
* Of a CLI's stderr keep a tail (4 KB is enough for the reason), cut on a
  whole rune, with the number of bytes cut before it in a first line that
  says so.
* Reports from the watcher and the reader are made sequential before they
  reach the caller.

A no-output limit apart from the total timeout

* A command may be allowed an hour and still be stale after ten silent
  minutes. The wait for output starts again at each write, and its expiry
  is a result of its own, not a timeout.
* When it fires, compare the count of writes with the count when the wait
  started: a wait that passed beside a write it has not been told of yet
  is not silence. Start it again.

The process start and the timer are injected

* The supervisor starts through an interface it declares: start a command
  (name, arguments, directory, environment, stdin, stderr) and get back the
  process: its stdout, its group, its token, a signal to the group and a
  wait for its exit. The real one is the operating system's; the
  composition root gives it.
* Every wait (timeout, kill grace, output grace, no-output limit) is a
  timer the supervisor is given, `func(time.Duration) (fired <-chan
  time.Time, stop func())`.
* Tests give a starter that runs a fake program in a goroutine over a
  pipe, and a manual clock. A signal to the fake's group cancels its
  context, a fake that has returned answers a signal with `ESRCH`, and its
  group is numbered above any process ID the system gives, so a reference
  to it names no real group. So the timeout, termination, leftover and
  output logic runs in every test with no process and no real wait.
* Real process groups, tokens and pipes are proven by a few tests that say
  so; there, timeouts that decide an outcome are still on the injected
  timer, and the group comes from the supervisor's own report, not from a
  file the command writes.
