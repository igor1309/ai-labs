// Command summarywindow replays recorded calls through the feed's call
// events on a fake clock and compares ways of keeping a running summary:
// rereading the whole call at each window, or rolling a summary over
// windows of several sizes and overlaps. It scores each summary against
// facts fixed in advance for each call.
//
//	go run ./experiment/summarywindow -gen              # rewrite fixtures
//	go run ./experiment/summarywindow -out results.json # call the model
//	go run ./experiment/summarywindow -report results.json
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"time"
)

// strategies are the ways compared. Each rolling one has its own window
// and overlap; rereading runs at the feed's default cadence.
var strategies = []Strategy{
	{Name: "reread 3m/1m", Size: 3 * time.Minute, Overlap: time.Minute, Reread: true},
	{Name: "rolling 3m/1m", Size: 3 * time.Minute, Overlap: time.Minute},
	{Name: "rolling 3m/0", Size: 3 * time.Minute},
	{Name: "rolling 5m/1m", Size: 5 * time.Minute, Overlap: time.Minute},
	{Name: "rolling 10m/2m", Size: 10 * time.Minute, Overlap: 2 * time.Minute},
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("summarywindow", flag.ContinueOnError)
	flags.SetOutput(stderr)
	fixtures := flags.String("fixtures", "experiment/summarywindow/testdata", "folder of fixture calls")
	gen := flags.Bool("gen", false, "write the generated fixtures to the fixtures folder and stop")
	model := flags.String("model", "haiku", "model for claude -p")
	out := flags.String("out", "", "file to write every step's results to")
	report := flags.String("report", "", "print the report tables of a results file and stop")
	if err := flags.Parse(args); err != nil {
		return 64
	}
	switch {
	case *gen:
		if err := writeFixtures(*fixtures); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		return 0
	case *report != "":
		b, err := os.ReadFile(*report)
		var runs []Run
		if err == nil {
			err = json.Unmarshal(b, &runs)
		}
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		writeReport(stdout, runs)
		return 0
	case *out == "":
		fmt.Fprintln(stderr, "give -out, -report or -gen")
		return 64
	}
	calls, err := loadFixtures(*fixtures)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	runs, err := compare(ctx, calls, strategies, claudeCLI{model: *model}, stderr)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	b, _ := json.MarshalIndent(runs, "", "  ")
	if err := os.WriteFile(*out, append(b, '\n'), 0o644); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	writeReport(stdout, runs)
	return 0
}

func compare(ctx context.Context, calls []Fixture, strategies []Strategy, m Model, progress io.Writer) ([]Run, error) {
	var runs []Run
	for _, f := range calls {
		for _, s := range strategies {
			r, err := play(ctx, f, s, m)
			if err != nil {
				return nil, err
			}
			fmt.Fprintf(progress, "%s / %s: %d steps\n", f.Name, s.Name, len(r.Steps))
			runs = append(runs, r)
		}
	}
	return runs, nil
}
