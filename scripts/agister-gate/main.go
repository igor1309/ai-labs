// Command agister-gate drives one step of a change through the gate:
// implement, commit, review, fix if a major is ruled fix, review again, at
// most three reviews, then stop (LAB-203). It runs `agister` and `git` in
// the caller's worktree and decides nothing else: the step's briefs are the
// issue's and the owner's words, the rulings the judge's.
//
//   - The goal and step briefs are written from the issue's text and the
//     owner's constraints, as written (LAB-204); no brief comes from the
//     caller's own words.
//   - The step's brief is implemented with the implement workflow named.
//     Its run's files_changed are staged by name and committed; a change
//     the run did not report stops the step.
//   - code_review reviews the commits since base against the goal.
//   - Items the judge rules fix with severity major go to a fix run: the
//     step's brief, with the items as its "## Acts on". Minors are not
//     fixed by the gate.
//   - A major still ruled fix after the third review stops the step for
//     the owner. Nothing major is deferred by the gate.
//   - A review that a provider limit failed does not count: the step stops,
//     and `--from review --reviews <n>` resumes it at that review.
//   - An implement run that leaves a point open stops the step, its work
//     committed, with the point in the summary (ADR-032).
//
// The summary is printed as JSON on stdout; progress goes to stderr.
//
// Usage:
//
//	agister-gate --issue <file> --title <line> [--constraints <file>]
//	  --implement <workflow> --base <rev> --message <subject> --out <dir>
//	  [--dir <worktree>] [--from implement|review] [--reviews <n>]
//
// Exit 0: no major is left to fix. 3: a major is left after the third
// review; the owner decides. 4: a review hit a provider limit. 5: an
// implement run left a point open. 1: anything else stopped the step. 2:
// usage.
package main

import (
	"context"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], commands, os.Stdout, os.Stderr))
}

// commands runs a program in dir, returning its standard output. Its
// standard error goes to this process's, which is the caller's progress.
func commands(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Stderr = os.Stderr
	return cmd.Output()
}
