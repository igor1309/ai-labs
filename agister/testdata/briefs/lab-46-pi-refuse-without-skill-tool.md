# LAB-46: refuse a Pi call that cannot read a skill

Owner decision on code_review run 20261001T143449Z-f65c50, item "Pi calls
run without repository skills when the plan has no read or bash tool"
(advisor run 20261001T144208Z-f836a3 referred it to the owner): option (a).

ADR-006 says a call loads its repository's instructions and skills and
gets the tool it needs to use a skill. A skill is used by reading it, and
Pi reads with `read` or `bash` only. With the service an `agister init`
home has, `ask_pi` resolves to no primitives (each Pi read tool grants
`host.read`), Pi runs with `--no-tools`, and 0.85.1 then leaves skills out.

Do:

1. Refuse, before Pi starts, a Pi call whose granted primitives include
   neither `read` nor `bash`. The refusal is recorded like the other
   refusals, and its message says that Pi needs `read` or `bash` to use the
   repository's skills (ADR-006), and which permissions the plan withheld
   that `read` needs. Put the check where the adapter's other refusals are
   (`pi/1 cannot limit cost`), unless a runtime preflight already exists
   that fits better; say which and why.
2. Replace `TestNoToolsAndDefaults` with a refusal test, and keep a test
   that `--no-tools` is never passed for a call that runs. Add a CLI-level
   test with the `agister init` service that `ask_pi` is refused with that
   message, in `t.TempDir()`.
3. `agister/examples/pi/README.md`: say that a Pi call needs `read` or
   `bash`, so its policy and the service must allow `read`'s permissions
   (`repository.read`, `host.read`), and that a home from `agister init`
   does not allow `host.read`.

Do not call a real provider. Run the full check from `agister/` (its
AGENTS.md). Report each command with its exit code and final line, and
list every file you changed.
