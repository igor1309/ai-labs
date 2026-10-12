package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// maxReviews is the cap on the reviews of one step that count.
const maxReviews = 3

// Exit codes; see the command's doc.
const (
	exitPassed  = 0
	exitStopped = 1
	exitUsage   = 2
	exitOwner   = 3
	exitLimited = 4
)

// runner runs a program in dir and returns its standard output. A program
// that exits non-zero returns its output and an error.
type runner func(ctx context.Context, dir, name string, args ...string) ([]byte, error)

// options are the command's flags.
type options struct {
	goal, step, implement, base, message, out, dir, from string
	reviews                                              int
}

// result is what `agister run --json` prints: a run's id, status, output
// and, for a run that failed, its error.
type result struct {
	RunID  string          `json:"run_id"`
	Status string          `json:"status"`
	Output json.RawMessage `json:"output"`
	Error  *struct {
		Class   string `json:"class"`
		Message string `json:"message"`
	} `json:"error"`
}

// implemented is the output of an implement run that the gate reads.
type implemented struct {
	FilesChanged []string `json:"files_changed"`
}

// item is one item of a judgement.
type item struct {
	Ruling   string   `json:"ruling"`
	Severity string   `json:"severity"`
	Sources  []string `json:"sources"`
	Title    string   `json:"title"`
	Action   string   `json:"action"`
}

// judgement is the output of a code_review run.
type judgement struct {
	Items []item `json:"items"`
}

// summary is what the gate prints when it stops.
type summary struct {
	Status     string      `json:"status"`
	Reason     string      `json:"reason"`
	Implements []implement `json:"implements"`
	Reviews    []review    `json:"reviews"`
	// Left is the last counted review's items the gate did not act on:
	// majors still ruled fix, minors ruled fix and items ruled defer.
	Left left `json:"left"`
}

type implement struct {
	RunID  string `json:"run_id"`
	Brief  string `json:"brief"`
	Commit string `json:"commit"`
}

type review struct {
	RunID   string `json:"run_id"`
	Counted bool   `json:"counted"`
	Majors  int    `json:"majors_to_fix"`
}

type left struct {
	Majors   []item `json:"majors"`
	Minors   []item `json:"minors"`
	Deferred []item `json:"deferred"`
}

// stop ends the step with status and reason.
type stop struct {
	status, reason string
}

func (s stop) Error() string { return s.reason }

func run(ctx context.Context, args []string, call runner, stdout, stderr io.Writer) int {
	o, err := parse(args, stderr)
	if err != nil {
		fmt.Fprintln(stderr, "agister-gate:", err)
		return exitUsage
	}
	g := gate{options: o, run: call, progress: stderr}
	sum := g.drive(ctx)
	out, _ := json.MarshalIndent(sum, "", "  ")
	fmt.Fprintln(stdout, string(out))
	switch sum.Status {
	case "passed":
		return exitPassed
	case "owner":
		return exitOwner
	case "limited":
		return exitLimited
	}
	return exitStopped
}

func parse(args []string, stderr io.Writer) (options, error) {
	var o options
	fs := flag.NewFlagSet("agister-gate", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&o.goal, "goal", "", "the goal brief")
	fs.StringVar(&o.step, "step", "", "the step brief")
	fs.StringVar(&o.implement, "implement", "", "the implement workflow, such as implement_codex")
	fs.StringVar(&o.base, "base", "", "the revision the review compares with")
	fs.StringVar(&o.message, "message", "", "the commit subject")
	fs.StringVar(&o.out, "out", "", "the directory for the fix briefs and the runs' results")
	fs.StringVar(&o.dir, "dir", ".", "the worktree")
	fs.StringVar(&o.from, "from", "implement", "implement, or review to resume at a review")
	fs.IntVar(&o.reviews, "reviews", 0, "reviews of this step already counted, with --from review")
	if err := fs.Parse(args); err != nil {
		return o, err
	}
	for name, v := range map[string]string{"goal": o.goal, "step": o.step, "implement": o.implement, "base": o.base, "message": o.message, "out": o.out} {
		if v == "" {
			return o, fmt.Errorf("--%s is required", name)
		}
	}
	if o.from != "implement" && o.from != "review" {
		return o, fmt.Errorf("--from is implement or review, not %q", o.from)
	}
	if o.reviews < 0 || o.reviews >= maxReviews {
		return o, fmt.Errorf("--reviews is 0 to %d", maxReviews-1)
	}
	for _, p := range []*string{&o.goal, &o.step, &o.out, &o.dir} {
		abs, err := filepath.Abs(*p)
		if err != nil {
			return o, err
		}
		*p = abs
	}
	return o, nil
}

type gate struct {
	options
	run      runner
	progress io.Writer
	sum      summary
	seq      int
}

func (g *gate) drive(ctx context.Context) summary {
	err := g.steps(ctx)
	var s stop
	if errors.As(err, &s) {
		g.sum.Status, g.sum.Reason = s.status, s.reason
	} else if err != nil {
		g.sum.Status, g.sum.Reason = "stopped", err.Error()
	}
	return g.sum
}

func (g *gate) steps(ctx context.Context) error {
	if err := os.MkdirAll(g.out, 0o755); err != nil {
		return err
	}
	if err := g.clean(ctx); err != nil {
		return err
	}
	counted := g.reviews
	if g.from == "implement" {
		if err := g.implementAndCommit(ctx, g.step, g.message); err != nil {
			return err
		}
	}
	for {
		j, err := g.review(ctx, counted+1)
		if err != nil {
			return err
		}
		counted++
		majors := g.leave(j)
		if len(majors) == 0 {
			return stop{"passed", fmt.Sprintf("review %d has no major ruled fix", counted)}
		}
		if counted == maxReviews {
			return stop{"owner", fmt.Sprintf("review %d, the last, leaves %d major(s) ruled fix", counted, len(majors))}
		}
		brief, err := g.fixBrief(counted, majors)
		if err != nil {
			return err
		}
		if err := g.implementAndCommit(ctx, brief, fmt.Sprintf("%s (review %d)", g.message, counted)); err != nil {
			return err
		}
	}
}

// leave records the items of j the gate does not act on, and returns the
// majors ruled fix.
func (g *gate) leave(j judgement) []item {
	g.sum.Left = left{Majors: []item{}, Minors: []item{}, Deferred: []item{}}
	for _, it := range j.Items {
		switch {
		case it.Ruling == "fix" && it.Severity == "major":
			g.sum.Left.Majors = append(g.sum.Left.Majors, it)
		case it.Ruling == "fix":
			g.sum.Left.Minors = append(g.sum.Left.Minors, it)
		case it.Ruling == "defer":
			g.sum.Left.Deferred = append(g.sum.Left.Deferred, it)
		}
	}
	return g.sum.Left.Majors
}

// clean stops the step unless the worktree has no change: the gate commits
// what a run reports, and only that.
func (g *gate) clean(ctx context.Context) error {
	out, err := g.run(ctx, g.dir, "git", "status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return fmt.Errorf("git status: %w", err)
	}
	if s := strings.TrimSpace(string(out)); s != "" {
		return stop{"stopped", "the worktree has changes: " + strings.Join(strings.Fields(s), " ")}
	}
	return nil
}

func (g *gate) implementAndCommit(ctx context.Context, brief, message string) error {
	r, err := g.agister(ctx, "implement", g.implement, "--param", "brief="+brief, "--param", "candidate=HEAD", "--json")
	if err != nil {
		return err
	}
	if r.Status != "completed" {
		return stop{"stopped", fmt.Sprintf("implement run %s %s%s", r.RunID, r.Status, failure(r))}
	}
	var out implemented
	if err := json.Unmarshal(r.Output, &out); err != nil {
		return fmt.Errorf("implement run %s: output: %w", r.RunID, err)
	}
	if len(out.FilesChanged) == 0 {
		return stop{"stopped", fmt.Sprintf("implement run %s changed no file", r.RunID)}
	}
	if _, err := g.run(ctx, g.dir, "git", append([]string{"add", "--"}, out.FilesChanged...)...); err != nil {
		return fmt.Errorf("git add: %w", err)
	}
	if err := g.unreported(ctx, r.RunID); err != nil {
		return err
	}
	if _, err := g.run(ctx, g.dir, "git", "commit", "-q", "-m", message); err != nil {
		return fmt.Errorf("git commit: %w", err)
	}
	head, err := g.run(ctx, g.dir, "git", "rev-parse", "HEAD")
	if err != nil {
		return fmt.Errorf("git rev-parse: %w", err)
	}
	g.sum.Implements = append(g.sum.Implements, implement{RunID: r.RunID, Brief: brief, Commit: strings.TrimSpace(string(head))})
	fmt.Fprintf(g.progress, "agister-gate: implement %s committed %s\n", r.RunID, strings.TrimSpace(string(head)))
	return nil
}

// unreported stops the step when, with the run's files staged, the
// worktree still has a change: a file the run changed and did not report.
func (g *gate) unreported(ctx context.Context, runID string) error {
	out, err := g.run(ctx, g.dir, "git", "status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return fmt.Errorf("git status: %w", err)
	}
	var left []string
	for _, line := range strings.Split(string(out), "\n") {
		// A line is two status letters, a space and the path; a staged
		// change has a blank second letter.
		if len(line) > 3 && line[1] != ' ' {
			left = append(left, line[3:])
		}
	}
	if len(left) > 0 {
		return stop{"stopped", fmt.Sprintf("implement run %s changed files it did not report: %s", runID, strings.Join(left, ", "))}
	}
	return nil
}

func (g *gate) review(ctx context.Context, n int) (judgement, error) {
	r, err := g.agister(ctx, "review", "code_review", "--param", "base="+g.base, "--param", "goal="+g.goal, "--json")
	if err != nil {
		return judgement{}, err
	}
	if r.Status != "completed" {
		limited := r.Error != nil && r.Error.Class == "rate_limited"
		g.sum.Reviews = append(g.sum.Reviews, review{RunID: r.RunID})
		if limited {
			return judgement{}, stop{"limited", fmt.Sprintf("review run %s hit a provider limit and does not count; resume with --from review --reviews %d", r.RunID, n-1)}
		}
		return judgement{}, stop{"stopped", fmt.Sprintf("review run %s %s%s", r.RunID, r.Status, failure(r))}
	}
	var j judgement
	if err := json.Unmarshal(r.Output, &j); err != nil {
		return j, fmt.Errorf("review run %s: output: %w", r.RunID, err)
	}
	majors := 0
	for _, it := range j.Items {
		if it.Ruling == "fix" && it.Severity == "major" {
			majors++
		}
	}
	g.sum.Reviews = append(g.sum.Reviews, review{RunID: r.RunID, Counted: true, Majors: majors})
	fmt.Fprintf(g.progress, "agister-gate: review %d, %s: %d major(s) ruled fix\n", n, r.RunID, majors)
	return j, nil
}

// agister runs `agister run <workflow> args...` in the worktree and keeps
// its result in out. A run that fails still prints its result.
func (g *gate) agister(ctx context.Context, kind, workflow string, args ...string) (result, error) {
	g.seq++
	stdout, runErr := g.run(ctx, g.dir, "agister", append([]string{"run", workflow}, args...)...)
	path := filepath.Join(g.out, fmt.Sprintf("%02d-%s.json", g.seq, kind))
	if err := os.WriteFile(path, stdout, 0o644); err != nil {
		return result{}, err
	}
	var r result
	if err := json.Unmarshal(stdout, &r); err != nil {
		return r, fmt.Errorf("agister run %s printed no result (%v): %w", workflow, runErr, err)
	}
	return r, nil
}

func failure(r result) string {
	if r.Error == nil {
		return ""
	}
	return fmt.Sprintf(": %s: %s", r.Error.Class, r.Error.Message)
}

// fixBrief writes the brief of the fix run after review n: the step's
// brief, titled for the review, with the majors as its "## Acts on".
func (g *gate) fixBrief(n int, majors []item) (string, error) {
	data, err := os.ReadFile(g.step)
	if err != nil {
		return "", err
	}
	title, parts := sections(string(data))
	var acts strings.Builder
	fmt.Fprintf(&acts, "The judgement of `code_review` run `%s`, its items ruled `fix` with severity major, as written:\n\n", g.sum.Reviews[len(g.sum.Reviews)-1].RunID)
	for _, it := range majors {
		fmt.Fprintf(&acts, "- **%s** (%s): %s\n", it.Title, strings.Join(it.Sources, ", "), it.Action)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s, review %d\n", strings.TrimRight(title, "\n"), n)
	for _, p := range parts {
		if p.heading == "## Acts on" {
			continue
		}
		fmt.Fprintf(&b, "\n%s\n\n%s\n", p.heading, strings.TrimSpace(p.body))
		if p.heading == "## Covers" {
			fmt.Fprintf(&b, "\n## Acts on\n\n%s", acts.String())
		}
	}
	path := filepath.Join(g.out, fmt.Sprintf("fix-%d.md", n))
	return path, os.WriteFile(path, []byte(b.String()), 0o644)
}

type part struct {
	heading, body string
}

// sections splits a brief into its title, the text before its first
// "## " heading, and its parts, each a "## " heading and its text.
func sections(text string) (string, []part) {
	var title strings.Builder
	var parts []part
	for _, line := range strings.SplitAfter(text, "\n") {
		if strings.HasPrefix(line, "## ") {
			parts = append(parts, part{heading: strings.TrimSpace(line)})
			continue
		}
		if len(parts) == 0 {
			title.WriteString(line)
			continue
		}
		parts[len(parts)-1].body += line
	}
	return strings.TrimSpace(title.String()), parts
}
