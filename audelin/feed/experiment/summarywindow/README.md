# Summary window experiment

Replays recorded calls through the feed's call events (`callevents`) on a
fake clock, so an hour-long call replays in seconds, and compares two ways
of keeping a running summary of a call: rereading the whole call at each
window, and rolling a summary forward over windows of a given size and
overlap. Every summary is scored against facts fixed in advance for each
call: questions, decisions (one taken back later), numbers, actions, a risk
and a code word said early.

The calls in `testdata/` are generated, not recorded: `fixture.go` writes
them from a fixed seed, and a test checks the files match.

From `audelin/feed`:

```sh
go run ./experiment/summarywindow -gen                       # rewrite the fixtures
go run ./experiment/summarywindow -out results/haiku.json    # calls the model, costs money
go run ./experiment/summarywindow -report experiment/summarywindow/results/haiku.json
```

The run calls `claude -p` once per window and strategy (about 130 calls for
both fixtures) and needs the sandbox off. Results and the report:
`../../../docs/research/summary-window-experiment.md`.
