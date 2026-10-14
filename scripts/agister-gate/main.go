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
//   - The review workflow named, code_review unless --review names
//     another, reviews the commits since base against the goal.
//   - Items the judge rules fix with severity major go to a fix run: the
//     step's brief, with the items as its "## Acts on". Minors are not
//     fixed by the gate.
//   - A major still ruled fix after the third review stops the step for
//     the owner. Nothing major is deferred by the gate.
//   - A review that a provider limit failed does not count: the step stops,
//     and `--from review --reviews <n> --base <summary.base>` resumes it at
//     that review. A new step pins --base before setup; a resumed step
//     requires the full commit printed in the preceding summary. Every
//     review and brief uses that commit.
//   - A point an implement run leaves open goes to the advisor, at the
//     run's commit: the question file is the point as the run wrote it.
//     The advisor's decision is appended to the decisions record as the
//     next D-<n>, Provisional (advisor), committed, and run as a fix brief
//     with the record as its "## Acts on"; the summary lists the record.
//     A conflict stops the step for the owner. A step puts one question:
//     a second open point stops it (ADR-032).
//
// The summary is printed as JSON on stdout; progress goes to stderr.
//
// Usage:
//
//	agister-gate --issue <file> --title <line> [--constraints <file>]
//	  --implement <workflow> --advisor <workflow> --decisions <file>
//	  --base <rev> --message <subject> --out <dir>
//	  [--review <workflow>] [--dir <worktree>] [--from implement|review] [--reviews <n>]
//
// Exit 0: no major is left to fix. 3: the owner decides: a major is left
// after the third review, or the advisor found a conflict in the record.
// 4: a review hit a provider limit. 5: a second point was left open; the
// issue does not say enough. 1: anything else stopped the step. 2: usage.
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
