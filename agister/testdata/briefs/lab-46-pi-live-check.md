# LAB-46: record the live check of Pi's read tools

Pi 0.85.1 was checked live through Agister (contract `pi/1`, agent
`pi-minimax`, model `opencode-go/minimax-m3`, process `ask_pi`, policy
`read-only`, a throwaway Agister home with `read`, `grep`, `find` and `ls`
marked verified for the check):

- run `20261001T141844Z-77906d` (completed, $0.0040, 23.7 s): the plan
  granted `[read grep find ls]` and withheld `repository.diff`,
  `repository.history.read` and `process.execute`; `read` read
  `agister/internal/adapters/runtime/pi/pi.go` in the checkout and
  `/etc/hosts` outside it. The record holds runtime `pi`, contract `pi/1`,
  version `0.85.1`, the profile's model, the reported session and the cost
  with source `runtime`.
- run `20261001T141916Z-879ab7` (completed, $0.0017, 11.2 s): `ls` listed
  `/etc/ssh` and `agister/examples/pi`; `find` found `hosts` under `/etc`;
  `grep` matched in `/etc/hosts` and under
  `agister/internal/adapters/runtime`.

So each of the four reads the repository and the host, as the mapping
says. `edit`, `write` and `bash` were not checked.

Do:

1. `agister/examples/pi/runtimes/pi.yaml`: mark `read`, `grep`, `find` and
   `ls` `verified: ["0.85."]`, as `examples/settings/runtimes/claude-code.yaml`
   marks its tools; leave `edit`, `write` and `bash` unverified, and make
   the leading comment say which are verified and which never granted yet.
2. `agister/docs/findings.md`: add the finding in the file's existing
   style, with the two runs and what was and was not checked.
3. `agister/examples/pi/README.md`: it says `agister check` refuses the
   settings as shipped; correct it to what now holds (the read tools are
   verified for 0.85; a policy needing `edit`, `write` or `bash` is still
   refused), and add the two commands a reader runs to try it
   (copying the example into their Agister home, then `agister run ask_pi
   --param question=...`).
4. `agister/cmd/agister/pi_settings_test.go` and any other test that
   asserts the unverified state: update to the new state, keeping a test
   that an unverified primitive is not granted.
5. `agister/README.md`: where it says `examples/codex/` is opt-in, mention
   `examples/pi/` the same way.

Run the full check from `agister/` (its AGENTS.md). Report each command
with its exit code and final line, and list every file you changed.
