---
date: 2026-10-28
model: claude-opus-5-5
description: "check-input implementation notes: one named input of a process checked against its brief forms with run's validator, nothing run or recorded; the closest form's faults; the skill's form rules generated from home"
---

# check-input implementation notes

`agister check-input <process> <input>=<file>` tells a person, or an
agent writing a brief, whether a file would pass the input's brief forms
before a run is asked for. It checks exactly what a run checks, by the
same code, and starts nothing: no run id, no record, no worktree held,
no turn, no signal watched.

Features: `cli/check_input.feature`, `cmd/agister/check_input.feature`,
`core/inputs/brief.feature` (the closest form, and the check without a
source), `cmd/skillforms/skillforms.feature`.

## core/inputs

The resolver's form check, today reached only from an input's
resolution, is given its own entry: the resolver checks a text against
forms and gives the name of the first form the text takes, or the error.
The run path calls the same entry from `input` after its source gives a
value, so the two cannot differ. No source is asked for anything; paths
is asked, as now, for each file a part refers to.

When no form is taken, the error names the closest form: the one with
the fewest faults, the first declared winning a tie. It lists that
form's faults alone, in its parts' order, then the other forms on one
line, in their declared order, each with its count:

```text
it takes none of its forms; closest "step": part "## Goal" is missing, part "## Open" is missing; other forms: "goal" 4 faults
```

One fault reads "1 fault". With one form there are no other forms and
the part after the last ";" is left out:

```text
it takes none of its forms; closest "f": part "## Goal" is missing, part "## Open" is missing
```

Paths failing to tell stays an error, not a fault: the first such error
ends the check, as now (`part "## Goal": "g.md": <paths' error>`), and
no form is named closest. A run's refusal reason carries the new words,
after `input "<name>": `, as before.

The existing single-form rows of `core/inputs/brief.feature` assert
their fault text within the reason, not the whole reason; their tests,
which today hard-code the prefix `it takes none of its forms: "f": `,
assert the new prefix `it takes none of its forms; closest "f": `.

## The command line

cli declares one port more, beside settings, runner and runs:

```go
type Inputs interface {
	CheckInput(launch string, check InputCheck) (form string, err error)
}
```

`InputCheck` is the process, the input and the file, as given. `New`
takes it after `runs`, refusing nil. The verb parses as
`check-input <process> <input>=<file>`, `--dir` anywhere, as every
command takes it; any other flag, a missing or extra word, an argument
with no "=", an empty name or an empty file is a bad command: usage,
exit 2, the port not asked. The first "=" splits the name from the file,
so a file may hold "=". The launch directory is found as for every
command. The file goes to the port as given; cli does not join it.

The usage gains:

```text
  agister check-input <process> <input>=<file> [--dir <directory>]
```

A form given prints, exit 0:

```text
$ agister check-input implement brief=b.md
b.md takes the form "step"
```

An error prints on stderr, through the command line's one error path,
exit 1, nothing on stdout:

```text
$ agister check-input implement brief=b.md
agister: input "brief" of the process "implement": it takes none of its forms; closest "step": part "## Goal" is missing, part "## Open" is missing; other forms: "goal" 4 faults
```

A write to stdout that fails is the command's error, as for every
command.

## The composition

`cmd/agister` answers the port with an `inputChecks` beside `runs`,
built in `build` over home, links, the layout file system, the worktree
roots, the wrappers, sourcing and the host's context. It holds no
record store, turns, holding, clock, timer, signals or randomness: what
it is not given it cannot reach, which is what the scenario "Checking
leaves no run behind" proves, with spies for each that fail the test if
they are asked anything.

`CheckInput` does, in order:

1. Resolves the launch directory through links and reads the settings
   with `readSettings`, as `runs.Run` does: home, the repository and the
   project composed by field. A launch directory in no git worktree
   reads home's settings alone, as every settings read there does, and a
   `.agister` in that directory is ignored; check-input does not refuse
   it, as nothing runs there.
2. Resolves the request for the process document alone
   (`resolve.Document(KindProcess, name)`): no agent, no runtime, no
   step. Its faults are the error, in `faultLines`' words, after
   "the check is refused:". This is where a process no layer holds, and
   a brief form whose document has problems, are refused: resolve
   already follows each input's forms.
3. Finds the input by name in the resolved process. None is the error
   naming the inputs it has, in order:
   `the process "implement" has no input "goal"; it has
   "candidate_revision", "brief"`.
   An input that names no form is the error
   `the input "what" names no brief form`.
4. Builds the forms with `formsOf` over the snapshot's documents, as a
   run's plan does.
5. Reads the file with `fileSource`, its path the given one, relative to
   the launch directory as given; its source and arguments as declared
   are not used, so params and the other inputs are never asked for.
   Its errors are the source's, as a run gives them.
6. Builds a resolver over no sources and `briefPaths` at the launch
   directory, and checks the text against the forms. A form taken is the
   answer; else the error, after `input "<name>" of the process
   "<process>": `.

The process' other inputs, its params, prompt and environment are not
resolved; git is asked nothing past the layout's root.

## The skill's forms

`skills/agister/SKILL.md` gains a section "Brief forms" between the
lines `<!-- brief-forms:begin -->` and `<!-- brief-forms:end -->`. The
section is generated: `go run ./cmd/skillforms home/brief-forms
skills/agister/SKILL.md`, run from `agister/`. It lists every `*.yaml`
in the folder, sorted by name, types each with `settings/documents`'
brief, as `home_test.go` types home's runtimes, and renders each form:

```markdown
<!-- brief-forms:begin -->
## Brief forms

A process input may name brief forms; its text must take one. Check a
file with `agister check-input <process> <input>=<file>`.

### `goal`

| Part                    | Required | Rule          |
| ---                     | ---      | ---           |
| `## Intent`             | yes      |               |
| `## Done when`          | yes      |               |
| `## Expected behaviour` | no       |               |
| `## Out of scope`       | yes      |               |
| `## Sources`            | no       |               |
| `## Decisions`          | no       |               |
| `## Open`               | yes      | reads `None.` |

### `step`

| Part             | Required | Rule                                  |
| ---              | ---      | ---                                   |
| `## Goal`        | yes      | names an existing file in back quotes |
| `## Covers`      | yes      |                                       |
| `## Acts on`     | no       |                                       |
| `## Constraints` | no       |                                       |
| `## Open`        | yes      | reads `None.`                         |
<!-- brief-forms:end -->
```

Each table's cells are padded to the widest in their column, and the
separator row's `---` too, as the feature tables are aligned. A part
that both reads a text and refers to a file gives both rules,
joined by "; ". A `|` in a heading or a read text is written `\|`, and
a read text holding a back quote is set in double back quotes, so no
cell breaks its table or code span. The generator writes the file whole
only when the render and both markers are sound; else it exits 1, writing nothing.
`cmd/skillforms`' test renders the committed folder and compares the
committed skill's section byte for byte, so a form added, removed or
changed without regenerating fails `scripts/test.sh`. The render and the
check are one package function each, given a folder and a text, so the
test drives a temp directory too.

## Decisions

1. The check is a core/inputs entry, not a copy: run and check-input
   share every rule, and run's refusal gains the closest form.
2. The process is resolved alone, not as a step: no agent is needed,
   and a fault elsewhere in the process (a missing prompt) refuses the
   check as it would refuse every run of it.
3. The supplied file replaces the input's source whatever it declares;
   the check is of the text, not of where a run would read it.
4. The file path is relative to the launch directory, as the source
   "file" reads it, and so are the paths a brief names.
5. Every failure, a validation failure included, is the command's one
   error path, exit 1; no new exit code.
6. No git worktree is needed: nothing is held or run.
7. The generator is its own small command, not an agister verb: it is a
   build tool of this repository, not a caller's command. Its rules come
   from `settings/documents`, never from parsing YAML by hand; no form
   name is written in its code.
