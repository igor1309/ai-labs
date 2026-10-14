package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
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
	exitOpen    = 5
)

// runner runs a program in dir and returns its standard output; its
// standard error goes to stderr. A program that exits non-zero returns its
// output and an error.
type runner func(ctx context.Context, dir string, stderr io.Writer, name string, args ...string) ([]byte, error)

// options are the command's flags.
type options struct {
	issue, title, constraints, implement, advisor, review, decisions, base, message, out, dir, from, reviewed string
	reviews                                                                                                   int
	minors                                                                                                    bool
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
	Open         []point  `json:"open"`
}

// point is a point an implement run left open: its question, its options
// and what the run searched for the answer.
type point struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
	Searched []string `json:"searched"`
}

// item is one item of a judgement.
type item struct {
	Ruling   string   `json:"ruling"`
	Severity string   `json:"severity"`
	Sources  []string `json:"sources"`
	Title    string   `json:"title"`
	Action   string   `json:"action"`
}

// judgement is the output of a review run.
type judgement struct {
	Items []item `json:"items"`
}

// collected is a review as the judge received it, one entry of the review
// run's collection: a completed review's findings.
type collected struct {
	Output *struct {
		Findings []finding `json:"findings"`
	} `json:"output"`
}

// finding is the part of a review's finding that a fix run is given: where
// it is and its evidence.
type finding struct {
	File     string `json:"file"`
	Line     *int   `json:"line"`
	Evidence struct {
		Case  string   `json:"case"`
		Trace []string `json:"trace"`
	} `json:"evidence"`
	Requirement string `json:"requirement"`
}

// summary is what the gate prints when it stops.
type summary struct {
	Status     string      `json:"status"`
	Reason     string      `json:"reason"`
	Base       string      `json:"base"`
	Implements []implement `json:"implements"`
	Reviews    []review    `json:"reviews"`
	// Left is the last counted review's items the gate did not act on:
	// majors still ruled fix, minors ruled fix and items ruled defer.
	Left left `json:"left"`
	// Open is what an implement run left open that stopped the step.
	Open []point `json:"open,omitempty"`
	// Records are the decisions the gate appended to the decisions record.
	Records []string `json:"records,omitempty"`
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
	if len(args) > 0 && args[0] == "show" {
		return showCommand(args[1:], stdout, stderr)
	}
	o, err := parse(args, stderr)
	if err != nil {
		fmt.Fprintln(stderr, "agister-gate:", err)
		return exitUsage
	}
	g := gate{options: o, run: call, progress: stderr}
	sum := g.drive(ctx)
	out, _ := json.MarshalIndent(sum, "", "  ")
	fmt.Fprintln(stdout, string(out))
	return exitCode(sum.Status)
}

// showCommand runs `show [--full] <events.jsonl or out dir>`.
func showCommand(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("agister-gate show", flag.ContinueOnError)
	fs.SetOutput(stderr)
	full := fs.Bool("full", false, "show each program's output and standard error")
	if err := fs.Parse(args); err != nil || fs.NArg() != 1 {
		fmt.Fprintln(stderr, "usage: agister-gate show [--full] <events.jsonl or out dir>")
		return exitUsage
	}
	if err := show(fs.Arg(0), *full, stdout); err != nil {
		fmt.Fprintln(stderr, "agister-gate:", err)
		return exitStopped
	}
	return exitPassed
}

func exitCode(status string) int {
	switch status {
	case "passed":
		return exitPassed
	case "owner":
		return exitOwner
	case "limited":
		return exitLimited
	case "open":
		return exitOpen
	}
	return exitStopped
}

func parse(args []string, stderr io.Writer) (options, error) {
	var o options
	fs := flag.NewFlagSet("agister-gate", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.StringVar(&o.issue, "issue", "", "the issue's text the step makes true, as written")
	fs.StringVar(&o.title, "title", "", "the briefs' title, such as \"LAB-171 step 4\"")
	fs.StringVar(&o.constraints, "constraints", "", "the owner's constraints on the step, as written")
	fs.StringVar(&o.implement, "implement", "", "the implement workflow, such as implement_codex")
	fs.StringVar(&o.advisor, "advisor", "", "the advisor workflow, such as advisor_codex")
	fs.StringVar(&o.review, "review", "code_review", "the review workflow, such as code_review_codex")
	fs.StringVar(&o.decisions, "decisions", "", "the decisions record, in the worktree, a decision is appended to")
	fs.StringVar(&o.base, "base", "", "the revision the review compares with; --from review requires the full commit from the summary")
	fs.StringVar(&o.message, "message", "", "the commit subject")
	fs.StringVar(&o.out, "out", "", "the directory for the briefs, the runs' results and the gate's trail, events.jsonl")
	fs.StringVar(&o.dir, "dir", ".", "the worktree")
	fs.StringVar(&o.from, "from", "implement", "implement, or review to resume at a review")
	fs.IntVar(&o.reviews, "reviews", 0, "reviews of this step already counted, with --from review")
	fs.BoolVar(&o.minors, "minors", false, "send the minors ruled fix to the fix run with the majors")
	fs.StringVar(&o.reviewed, "reviewed", "", "a completed review run of base against HEAD, taken as the next review, with --from review")
	if err := fs.Parse(args); err != nil {
		return o, err
	}
	for name, v := range map[string]string{"issue": o.issue, "title": o.title, "implement": o.implement, "advisor": o.advisor, "decisions": o.decisions, "base": o.base, "message": o.message, "out": o.out} {
		if v == "" {
			return o, fmt.Errorf("--%s is required", name)
		}
	}
	if o.from != "implement" && o.from != "review" {
		return o, fmt.Errorf("--from is implement or review, not %q", o.from)
	}
	if o.from == "review" {
		// A ref or abbreviated hash can change identity between invocations.
		_, err := hex.DecodeString(o.base)
		if err != nil || (len(o.base) != 40 && len(o.base) != 64) {
			return o, fmt.Errorf("--from review requires --base to be the full commit from the preceding summary")
		}
	}
	if o.reviewed != "" && o.from != "review" {
		return o, fmt.Errorf("--reviewed takes a review run with --from review")
	}
	if o.reviews < 0 || o.reviews >= maxReviews {
		return o, fmt.Errorf("--reviews is 0 to %d", maxReviews-1)
	}
	for _, p := range []*string{&o.issue, &o.constraints, &o.decisions, &o.out, &o.dir} {
		if *p == "" {
			continue
		}
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
	// goal and step are the briefs the gate writes from the issue's text,
	// and issueText and constraintsText the texts it read, once.
	goal, step                 string
	issueText, constraintsText string
	run                        runner
	progress                   io.Writer
	sum                        summary
	// seq numbers the runs' results in out; events, the trail's events.
	seq, events int
	trail       io.WriteCloser
	// create opens the trail's file to append to; os.OpenFile when nil.
	create func(path string) (io.WriteCloser, error)
	// pending are the events made before the trail is open; broken, the
	// write to it that failed.
	pending []event
	broken  error
}

func (g *gate) drive(ctx context.Context) summary {
	err := g.started()
	if err == nil {
		err = g.resolveBase(ctx)
	}
	if err == nil {
		err = g.open()
	}
	if err == nil {
		err = g.steps(ctx)
	}
	var s stop
	if errors.As(err, &s) {
		g.sum.Status, g.sum.Reason = s.status, s.reason
	} else if err != nil {
		g.sum.Status, g.sum.Reason = "stopped", err.Error()
	}
	if g.trail != nil {
		// A step whose trail is not whole does not pass.
		if err := g.emit("STOPPED", map[string]any{"status": g.sum.Status, "reason": g.sum.Reason, "exit": exitCode(g.sum.Status), "summary": g.sum},
			fmt.Sprintf("stopped, %s: %s", g.sum.Status, g.sum.Reason)); err != nil {
			g.sum.Status, g.sum.Reason = "stopped", g.sum.Reason+"; "+err.Error()
		}
		if err := g.trail.Close(); err != nil {
			g.sum.Status, g.sum.Reason = "stopped", g.sum.Reason+"; trail: "+err.Error()
		}
	}
	return g.sum
}

func (g *gate) steps(ctx context.Context) error {
	if err := g.clean(ctx); err != nil {
		return err
	}
	if err := g.briefs(); err != nil {
		return err
	}
	counted := g.reviews
	if g.from == "implement" {
		if err := g.implementAndCommit(ctx, g.step, g.message); err != nil {
			return err
		}
	}
	for {
		review := g.review
		if g.reviewed != "" && counted == g.reviews {
			review = g.taken
		}
		j, err := review(ctx, counted+1)
		if err != nil {
			return err
		}
		counted++
		fix := g.leave(j)
		runID := g.sum.Reviews[len(g.sum.Reviews)-1].RunID
		if err := g.rulings(counted, runID, j, counted == maxReviews); err != nil {
			return err
		}
		if len(fix) == 0 {
			return stop{"passed", fmt.Sprintf("review %d has no %s ruled fix", counted, g.fixed())}
		}
		if counted == maxReviews {
			return stop{"owner", fmt.Sprintf("review %d, the last, leaves %d %s(s) ruled fix", counted, len(fix), g.fixed())}
		}
		reviews, err := g.collection(ctx, runID)
		if err != nil {
			return err
		}
		brief, err := g.fixBrief(counted, runID, fix, reviews)
		if err != nil {
			return err
		}
		// The review run names the commit: a resumed step counts its reviews
		// again, and a count would name two commits alike.
		if err := g.implementAndCommit(ctx, brief, fmt.Sprintf("%s (answers review %s)", g.message, runID)); err != nil {
			return err
		}
	}
}

// resolveBase pins the caller's revision before setup can move a shared
// remote ref. A resumed step keeps the full commit required by parse.
func (g *gate) resolveBase(ctx context.Context) error {
	if g.from == "review" {
		g.sum.Base = g.base
		return nil
	}
	out, err := g.command(ctx, "git", "rev-parse", "--verify", g.base+"^{commit}")
	if err != nil {
		return fmt.Errorf("git rev-parse base %q: %w", g.base, err)
	}
	base := strings.TrimSpace(string(out))
	if base == "" || strings.ContainsAny(base, " \t\r\n") {
		return fmt.Errorf("git rev-parse base %q returned no commit", g.base)
	}
	g.base = base
	g.sum.Base = base
	return g.emit("BASE_PINNED", map[string]any{"base": base}, "base pinned at "+base)
}

// fixed is what the gate fixes: majors, or with --minors, majors and
// minors.
func (g *gate) fixed() string {
	if g.minors {
		return "major or minor"
	}
	return "major"
}

// leave records the items of j the gate does not act on, and returns the
// items ruled fix it acts on: the majors, then with --minors the minors.
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
	if g.minors {
		return append(slices.Clone(g.sum.Left.Majors), g.sum.Left.Minors...)
	}
	return g.sum.Left.Majors
}

// clean stops the step unless the worktree has no change: the gate commits
// what a run reports, and only that.
func (g *gate) clean(ctx context.Context) error {
	out, err := g.command(ctx, "git", "status", "--porcelain", "--untracked-files=all")
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
	// A run reports its files from the worktree root, and --dir may be
	// below it, so each path is staged from the top.
	add := []string{"add", "--"}
	for _, f := range out.FilesChanged {
		add = append(add, ":(top)"+f)
	}
	if _, err := g.command(ctx, "git", add...); err != nil {
		return fmt.Errorf("git add: %w", err)
	}
	if err := g.unreported(ctx, r.RunID); err != nil {
		return err
	}
	if _, err := g.command(ctx, "git", "commit", "-q", "-m", message); err != nil {
		return fmt.Errorf("git commit: %w", err)
	}
	head, err := g.head(ctx)
	if err != nil {
		return err
	}
	g.sum.Implements = append(g.sum.Implements, implement{RunID: r.RunID, Brief: brief, Commit: head})
	if err := g.committed(head, message, out.FilesChanged, map[string]any{"implement_run": r.RunID, "brief": brief}); err != nil {
		return err
	}
	if len(out.Open) > 0 {
		return g.advise(ctx, r.RunID, out.Open, message)
	}
	return nil
}

// unreported stops the step when, with the run's files staged, the
// worktree still has a change: a file the run changed and did not report.
func (g *gate) unreported(ctx context.Context, runID string) error {
	out, err := g.command(ctx, "git", "status", "--porcelain", "--untracked-files=all")
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
	r, err := g.agister(ctx, "review", g.options.review, "--param", "base="+g.base, "--param", "goal="+g.goal, "--json")
	if err != nil {
		return judgement{}, err
	}
	if r.Status != "completed" {
		limited := r.Error != nil && r.Error.Class == "rate_limited"
		g.sum.Reviews = append(g.sum.Reviews, review{RunID: r.RunID})
		if limited {
			return judgement{}, stop{"limited", fmt.Sprintf("review run %s hit a provider limit and does not count; resume with --from review --reviews %d --base %s", r.RunID, n-1, g.base)}
		}
		return judgement{}, stop{"stopped", fmt.Sprintf("review run %s %s%s", r.RunID, r.Status, failure(r))}
	}
	return g.judged(r.RunID, r.Output)
}

// judged counts the judgement output of review run runID.
func (g *gate) judged(runID string, output json.RawMessage) (judgement, error) {
	var j judgement
	if err := json.Unmarshal(output, &j); err != nil {
		return j, fmt.Errorf("review run %s: output: %w", runID, err)
	}
	majors := 0
	for _, it := range j.Items {
		if it.Ruling == "fix" && it.Severity == "major" {
			majors++
		}
	}
	g.sum.Reviews = append(g.sum.Reviews, review{RunID: runID, Counted: true, Majors: majors})
	return j, nil
}

// taken takes review run g.reviewed as review n, in place of a run of its
// own. It must be a completed run of the step's review workflow that
// reviewed the step's base against HEAD, given as its goal the gate's goal
// or the issue's text as written: what a run of the gate's own would
// review.
func (g *gate) taken(ctx context.Context, n int) (judgement, error) {
	dir, err := g.export(ctx, g.reviewed)
	if err != nil {
		return judgement{}, err
	}
	data, err := g.read(filepath.Join(dir, "record.json"), "review run record")
	if err != nil {
		return judgement{}, fmt.Errorf("review run %s: %w", g.reviewed, err)
	}
	var record struct {
		Process string `json:"process"`
		Inputs  []struct {
			Name     string `json:"name"`
			Value    any    `json:"value"`
			Artifact *struct {
				Path string `json:"path"`
			} `json:"artifact"`
		} `json:"inputs"`
		Result struct {
			Status string          `json:"status"`
			Output json.RawMessage `json:"output"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &record); err != nil {
		return judgement{}, fmt.Errorf("review run %s: record: %w", g.reviewed, err)
	}
	if record.Process != g.options.review {
		return judgement{}, stop{"stopped", fmt.Sprintf("review run %s ran %s, and the step's review is %s", g.reviewed, record.Process, g.options.review)}
	}
	if record.Result.Status != "completed" {
		return judgement{}, stop{"stopped", fmt.Sprintf("review run %s is %s, not completed", g.reviewed, record.Result.Status)}
	}
	head, err := g.head(ctx)
	if err != nil {
		return judgement{}, err
	}
	// A long input is kept as an artifact of the run in place of its value.
	inputs := map[string]any{}
	for _, in := range record.Inputs {
		inputs[in.Name] = in.Value
		if in.Value == nil && in.Artifact != nil {
			data, err := g.read(filepath.Join(dir, in.Artifact.Path), "review run input "+in.Name)
			if err != nil {
				return judgement{}, fmt.Errorf("review run %s: %w", g.reviewed, err)
			}
			inputs[in.Name] = string(data)
		}
	}
	if inputs["base"] != g.base || inputs["candidate"] != head {
		return judgement{}, stop{"stopped", fmt.Sprintf("review run %s reviewed %v against %v, and the step is %s against %s",
			g.reviewed, inputs["base"], inputs["candidate"], g.base, head)}
	}
	goal, err := os.ReadFile(g.goal)
	if err != nil {
		return judgement{}, err
	}
	if inputs["goal"] != string(goal) && inputs["goal"] != g.issueText {
		return judgement{}, stop{"stopped", fmt.Sprintf("review run %s was given a goal that is neither the step's goal nor the issue's text", g.reviewed)}
	}
	return g.judged(g.reviewed, record.Result.Output)
}

// agister runs `agister run <workflow> args...` in the worktree and keeps
// its result in out. A run that fails still prints its result.
func (g *gate) agister(ctx context.Context, kind, workflow string, args ...string) (result, error) {
	g.seq++
	stdout, runErr := g.command(ctx, "agister", append([]string{"run", workflow}, args...)...)
	// A run that fails still prints its result; a trail that fails stops
	// the step.
	if errors.As(runErr, new(trailError)) {
		return result{}, runErr
	}
	path := filepath.Join(g.out, fmt.Sprintf("%02d-%s.json", g.seq, kind))
	if err := g.write(path, stdout, kind+" run result", map[string]any{"workflow": workflow}); err != nil {
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

// briefs writes the step's goal and step briefs into out. Their Done
// when and Covers are the issue's text, and their Constraints the owner's,
// as written: no brief says what the issue and the owner did not.
func (g *gate) briefs() error {
	issue, err := g.read(g.issue, "issue")
	if err != nil {
		return err
	}
	g.issueText = string(issue)
	if g.constraints != "" {
		constraints, err := g.read(g.constraints, "constraints")
		if err != nil {
			return err
		}
		g.constraintsText = string(constraints)
	}
	// The briefs take the number of the first run they are given to: a
	// resumed step writes its own, and keeps the last step's.
	g.goal = filepath.Join(g.out, fmt.Sprintf("%02d-goal.md", g.seq+1))
	g.step = filepath.Join(g.out, fmt.Sprintf("%02d-step.md", g.seq+1))
	goal := fmt.Sprintf("# %s\n\n## Intent\n\nWhat the issue's text, under Done when, makes true.\n\n"+
		"## Base\n\n%s\n\n## Done when\n\n%s\n## Out of scope\n\nWhat the issue's text, under Done when, leaves out.\n\n## Open\n\nNone.\n",
		g.title, g.base, fenced(g.issueText))
	if err := g.write(g.goal, []byte(goal), "goal brief", map[string]any{"issue": g.issue}); err != nil {
		return err
	}
	return g.write(g.step, []byte(g.stepBrief(g.title, "")), "step brief", map[string]any{"issue": g.issue, "constraints": g.constraints})
}

// stepBrief is the step brief titled title, with actsOn as its "## Acts on"
// when there is one.
func (g *gate) stepBrief(title, actsOn string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n## Goal\n\n`%s`\n\n## Base\n\n%s\n\n## Covers\n\n%s", title, g.goal, g.base, fenced(g.issueText))
	if actsOn != "" {
		fmt.Fprintf(&b, "\n## Acts on\n\n%s", actsOn)
	}
	if g.constraints != "" {
		fmt.Fprintf(&b, "\n## Constraints\n\n%s", fenced(g.constraintsText))
	}
	b.WriteString("\n## Open\n\nNone.\n")
	return b.String()
}

// fenced is text as written, in a code fence longer than any run of back
// quotes in it, so that its headings stay its own and not the brief's.
func fenced(text string) string {
	longest, run := 0, 0
	for _, r := range text {
		if r == '`' {
			run++
			longest = max(longest, run)
		} else {
			run = 0
		}
	}
	fence := strings.Repeat("`", max(3, longest+1))
	return fmt.Sprintf("%stext\n%s\n%s\n", fence, strings.TrimRight(text, "\n"), fence)
}

// collection is the reviews the judge of review run runID received, in
// their order, read from the run as `agister runs export` copies it into
// out.
func (g *gate) collection(ctx context.Context, runID string) ([]collected, error) {
	dir, err := g.export(ctx, runID)
	if err != nil {
		return nil, err
	}
	data, err := g.read(filepath.Join(dir, "artifacts", "collection.json"), "review collection")
	if err != nil {
		return nil, fmt.Errorf("review run %s: %w", runID, err)
	}
	var reviews []collected
	if err := json.Unmarshal(data, &reviews); err != nil {
		return nil, fmt.Errorf("review run %s: collection: %w", runID, err)
	}
	return reviews, nil
}

// export copies run runID, with its nodes, into out with `agister runs
// export`, and returns the run's copy.
func (g *gate) export(ctx context.Context, runID string) (string, error) {
	to := filepath.Join(g.out, "runs")
	if err := os.MkdirAll(to, 0o755); err != nil {
		return "", err
	}
	if out, err := g.command(ctx, "agister", "runs", "export", runID, "--to", to); err != nil {
		return "", fmt.Errorf("agister runs export %s: %w: %s", runID, err, out)
	}
	return filepath.Join(to, runID), nil
}

// fixBrief writes the brief of the fix run after review n: the step's
// brief with the majors as its "## Acts on", each its title and action as
// the judge wrote them, then the evidence of the findings it rests on, as
// the reviews wrote it: each finding's place, case, trace and requirement,
// a finding two reviews give alike once. The brief names no review, run,
// ruling or source: the implementer is given the changes to make and what
// shows them, not the process that asked for them (LAB-200). A source that
// names no finding of reviews stops the step.
func (g *gate) fixBrief(n int, runID string, majors []item, reviews []collected) (string, error) {
	var acts strings.Builder
	acts.WriteString("The changes to make, as written, each with the evidence the reviews give for it:\n\n")
	for _, it := range majors {
		fmt.Fprintf(&acts, "- **%s**: %s\n", it.Title, indented(it.Action, "  "))
		seen := map[string]bool{}
		for _, source := range it.Sources {
			f, err := resolve(source, reviews)
			if err != nil {
				return "", stop{"stopped", fmt.Sprintf("review %d: item %q: %v", n, it.Title, err)}
			}
			text := evidence(f)
			if !seen[text] {
				seen[text] = true
				acts.WriteString(text)
			}
		}
	}
	items := make([]map[string]any, len(majors))
	for i, it := range majors {
		items[i] = map[string]any{"title": it.Title, "sources": it.Sources}
	}
	path := filepath.Join(g.out, fmt.Sprintf("%02d-fix.md", g.seq+1))
	return path, g.write(path, []byte(g.stepBrief(g.title, acts.String())), "fix brief",
		map[string]any{"review": n, "review_run": runID, "items": items, "issue": g.issue, "constraints": g.constraints})
}

// head is the commit HEAD names.
func (g *gate) head(ctx context.Context) (string, error) {
	out, err := g.command(ctx, "git", "rev-parse", "HEAD")
	if err != nil {
		return "", fmt.Errorf("git rev-parse: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// committed records commit: its message, its files and what it came from.
func (g *gate) committed(commit, message string, files []string, from map[string]any) error {
	return g.emit("COMMITTED", map[string]any{"commit": commit, "message": message, "files": files, "from": from},
		fmt.Sprintf("committed %s: %s", commit, message))
}

// resolve is the finding source names, "<review>#<finding>", each counted
// from 1 in the order the judge received them.
func resolve(source string, reviews []collected) (finding, error) {
	var r, i int
	if _, err := fmt.Sscanf(source, "%d#%d", &r, &i); err != nil || fmt.Sprintf("%d#%d", r, i) != source {
		return finding{}, fmt.Errorf("source %q is not <review>#<finding>", source)
	}
	if r < 1 || r > len(reviews) || reviews[r-1].Output == nil || i < 1 || i > len(reviews[r-1].Output.Findings) {
		return finding{}, fmt.Errorf("source %q names no finding of the %d reviews", source, len(reviews))
	}
	return reviews[r-1].Output.Findings[i-1], nil
}

// evidence is f's place, case, trace and requirement, as a list item under
// its change.
func evidence(f finding) string {
	place := f.File
	if f.Line != nil {
		place = fmt.Sprintf("%s:%d", f.File, *f.Line)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "  - `%s`: %s\n", place, indented(f.Evidence.Case, "    "))
	for _, step := range f.Evidence.Trace {
		fmt.Fprintf(&b, "    - %s\n", indented(step, "      "))
	}
	fmt.Fprintf(&b, "    - Requirement: %s\n", indented(f.Requirement, "      "))
	return b.String()
}

// indented is text with every line after its first indented by prefix, so
// that it stays inside its list item.
func indented(text, prefix string) string {
	return strings.ReplaceAll(strings.TrimRight(text, "\n"), "\n", "\n"+prefix)
}
