# Deferred work

Known gaps accepted for the CLI stage. Each has a trigger: do it then, not
before.

## 1. Effects of a killed CLI wait for the next call

- **Gap:** after `agister run` is killed with SIGKILL, its runtime process
  group and checkout stay until the next submitted call reaps them.
- **Trigger:** the service (ADR-001 rule 16).
- **Done when:** the service reaps on start and periodically.

## 2. Only a timeout ends a stale agent or script

- **Gap:** an agent turn ends early only at the call's timeout, and a
  verification run only at its own. Neither tells slow from stale: an agent
  that emits nothing, a tool command that hangs, an agent repeating the
  same failing step, a script that stops producing output. A timeout long
  enough for honest work (45 minutes for an implementer) is then the only
  thing that ends a hang.
- **Needed:** staleness checks Agister owns, declared by the policy: time
  since the last runtime event or script output, the duration of the
  current tool command, and repeated identical tool calls. A stale call
  ends early, and its evidence says what went stale.
- **Trigger:** before implementers or verification run unattended.
- **Done when:** a stale agent turn and a stale verification run each end
  before their timeout, with the cause recorded, in tests using an injected
  clock.
