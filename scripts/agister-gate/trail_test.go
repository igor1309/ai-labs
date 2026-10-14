package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// trailOf is the trail in out, its events in order.
func trailOf(t *testing.T, out string) []event {
	t.Helper()
	file, err := os.Open(filepath.Join(out, trailFile))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var events []event
	scanner := bufio.NewScanner(file)
	scanner.Buffer(nil, 1<<20)
	for scanner.Scan() {
		var e event
		if err := json.Unmarshal(scanner.Bytes(), &e); err != nil {
			t.Fatalf("event %q: %v", scanner.Text(), err)
		}
		events = append(events, e)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return events
}

// ofKind is the events of kind, in order.
func ofKind(events []event, kind string) []event {
	var found []event
	for _, e := range events {
		if e.Kind == kind {
			found = append(found, e)
		}
	}
	return found
}

// strs is a JSON list of strings, as the trail gives it back.
func strs(v any) []string {
	list, _ := v.([]any)
	out := make([]string, len(list))
	for i, s := range list {
		out[i], _ = s.(string)
	}
	return out
}

// A step that is fixed once: a commit, a review, a fix, a review.
func fixedOnce(t *testing.T) *fake {
	return &fake{t: t, implements: []string{implementResult("i1", "cmd/a.go"), implementResult("i2", "cmd/a_test.go")},
		reviews: []string{reviewed("r1", major, minor, deferred, waived), reviewed("r2")}}
}

// Every program the gate runs is in its trail, in the order it ran, each
// started before it ran and finished with its output and error.
func TestTheTrailHoldsEveryCommandTheGateRanWithItsOutput(t *testing.T) {
	t.Parallel()
	f := fixedOnce(t)
	_, _, out := gated(t, f.run)
	var started, finished []event
	for _, e := range trailOf(t, out) {
		switch e.Kind {
		case "COMMAND_STARTED":
			started = append(started, e)
		case "COMMAND_FINISHED":
			if len(finished) != len(started)-1 {
				t.Fatalf("event %d finishes a command that was not the last started", e.Seq)
			}
			finished = append(finished, e)
		}
	}
	if len(started) != len(f.ran) || len(finished) != len(f.ran) {
		t.Fatalf("%d started, %d finished, %d ran", len(started), len(finished), len(f.ran))
	}
	for i, ran := range f.ran {
		if got := strs(started[i].Data["command"]); !reflect.DeepEqual(got, ran.command) {
			t.Errorf("command %d: trail %q, ran %q", i, got, ran.command)
		}
		if got := finished[i].Data["output"]; got != ran.output {
			t.Errorf("command %d %q: trail output %q, ran %q", i, ran.command, got, ran.output)
		}
	}
}

// A command that fails is in the trail with its error and its standard
// error, which is shown among the progress lines too.
func TestTheTrailHoldsTheErrorOfACommandThatFailed(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{`{"run_id":"i1","status":"failed"}`}, complaint: "fatal: the run was refused"}
	_, _, out, progress := gatedIn(t, t.TempDir(), f.run)
	finished := ofKind(trailOf(t, out), "COMMAND_FINISHED")
	last := finished[len(finished)-1]
	if got := strs(last.Data["command"]); got[0] != "agister" || last.Data["error"] != "exit status 1" ||
		last.Data["stderr"] != "fatal: the run was refused\n" {
		t.Errorf("last command %q, error %v, stderr %q; want the implement run's, exit status 1, its complaint",
			got, last.Data["error"], last.Data["stderr"])
	}
	if !strings.Contains(progress, "fatal: the run was refused\n") {
		t.Errorf("progress does not show the complaint:\n%s", progress)
	}
}

// Every file the gate leaves, in out or the decisions record, is in its
// trail as written last, with its digest; the files it read are there with
// theirs; and a brief names what it was made from.
func TestTheTrailHoldsEveryFileTheGateReadOrWrote(t *testing.T) {
	t.Parallel()
	for name, f := range map[string]*fake{
		"fixed once": fixedOnce(t),
		"advised": {implements: []string{leftOpen("i1", open), implementResult("i2", "cmd/a.go")},
			advisors: []string{advised("a1", decision)}, reviews: []string{reviewed("r1")}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			f.t = t
			_, _, out := gated(t, f.run)
			events := trailOf(t, out)
			written := map[string]event{}
			for _, e := range ofKind(events, "FILE_WRITTEN") {
				written[e.Data["path"].(string)] = e
			}
			var files []string
			if name == "advised" {
				files = append(files, filepath.Join(filepath.Dir(out), "decisions.md"))
			}
			err := filepath.WalkDir(out, func(path string, d fs.DirEntry, err error) error {
				if d.IsDir() && d.Name() == "runs" {
					return fs.SkipDir // what `agister runs export` copied
				}
				if !d.IsDir() && d.Name() != trailFile {
					files = append(files, path)
				}
				return err
			})
			if err != nil {
				t.Fatal(err)
			}
			for _, path := range files {
				data, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				e, ok := written[path]
				if !ok || e.Data["sha256"] != digest(data) {
					t.Errorf("%s: the trail does not hold it as it is: %v", path, e.Data)
				}
			}
			read := map[string]bool{}
			for _, e := range ofKind(events, "FILE_READ") {
				read[e.Data["what"].(string)] = true
			}
			for _, what := range []string{"issue", "constraints"} {
				if !read[what] {
					t.Errorf("the trail does not hold the %s read", what)
				}
			}
			if name == "fixed once" {
				from := written[filepath.Join(out, "fix-1.md")].Data["from"].(map[string]any)
				items := from["items"].([]any)
				if from["review_run"] != "r1" || len(items) != 1 || items[0].(map[string]any)["title"] != major.Title ||
					!reflect.DeepEqual(strs(items[0].(map[string]any)["sources"]), major.Sources) || !read["review collection"] {
					t.Errorf("the fix brief is made from %v, want r1's major and its sources, from the collection read", from)
				}
			}
		})
	}
}

// Each item a judge rules on is in the trail with what the gate did with it,
// and so is every commit.
func TestTheTrailGivesEachRulingWhatTheGateDidWithIt(t *testing.T) {
	t.Parallel()
	f := fixedOnce(t)
	_, _, out := gated(t, f.run)
	events := trailOf(t, out)
	rulings := ofKind(events, "RULINGS_READ")
	if len(rulings) != 2 || rulings[0].Data["run_id"] != "r1" || rulings[1].Data["run_id"] != "r2" {
		t.Fatalf("rulings %v", rulings)
	}
	var got []string
	for _, it := range rulings[0].Data["items"].([]any) {
		it := it.(map[string]any)
		got = append(got, it["title"].(string)+": "+it["gate"].(string))
	}
	want := []string{major.Title + ": sent to the fix run", minor.Title + ": left: the gate fixes no minor",
		deferred.Title + ": left: deferred", waived.Title + ": not acted on: ruled waive"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("rulings\n got %q\nwant %q", got, want)
	}
	var commits []string
	for _, e := range ofKind(events, "COMMITTED") {
		commits = append(commits, e.Data["commit"].(string)+" "+e.Data["message"].(string))
	}
	if want := []string{"c1 cmd: the call is refused", "c2 cmd: the call is refused (review 1)"}; !reflect.DeepEqual(commits, want) {
		t.Errorf("commits %q, want %q", commits, want)
	}
}

// A major the last review rules fix is left for the owner, and the trail
// says so.
func TestTheTrailSaysAMajorTheLastReviewRulesIsLeftForTheOwner(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "a"), implementResult("i2", "a"), implementResult("i3", "a")},
		reviews: []string{reviewed("r1", major), reviewed("r2", major), reviewed("r3", major)}}
	_, _, out := gated(t, f.run)
	rulings := ofKind(trailOf(t, out), "RULINGS_READ")
	last := rulings[len(rulings)-1].Data["items"].([]any)[0].(map[string]any)
	if len(rulings) != 3 || last["gate"] != "left for the owner: the last review rules it fix" {
		t.Errorf("%d rulings, the last item's %q", len(rulings), last["gate"])
	}
}

// The trail starts with the gate's options and ends with why the step
// stopped, its exit code and summary; each event is one progress line.
func TestTheTrailEndsWithWhyTheStepStopped(t *testing.T) {
	t.Parallel()
	f := &fake{t: t, implements: []string{implementResult("i1", "a"), implementResult("i2", "a"), implementResult("i3", "a")},
		reviews: []string{reviewed("r1", major), reviewed("r2", major), reviewed("r3", major)}}
	code, sum, out, progress := gatedIn(t, t.TempDir(), f.run)
	events := trailOf(t, out)
	first, last := events[0], events[len(events)-1]
	if first.Kind != "GATE_STARTED" || first.Data["title"] != "LAB-1 step 2" || first.Data["implement"] != "implement_codex" {
		t.Errorf("first event %+v", first)
	}
	if last.Kind != "STOPPED" || last.Data["status"] != sum.Status || last.Data["reason"] != sum.Reason || last.Data["exit"] != float64(code) {
		t.Errorf("last event %+v, want the stop of exit %d, %+v", last, code, sum)
	}
	if kept := last.Data["summary"].(map[string]any); kept["base"] != sum.Base || len(kept["reviews"].([]any)) != 3 {
		t.Errorf("summary kept %v", kept)
	}
	for i, e := range events {
		if e.Seq != i+1 || e.At.IsZero() {
			t.Errorf("event %d: seq %d, at %v", i, e.Seq, e.At)
		}
	}
	if lines := strings.Count(progress, "\n"); lines != len(events) {
		t.Errorf("%d progress lines for %d events:\n%s", lines, len(events), progress)
	}
}

// A step resumed in the same out appends to its trail: the events go on
// from the last, and no run's result is written over.
func TestAResumedStepAppendsToItsTrail(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	first := &fake{t: t, implements: []string{implementResult("i1", "a")}, reviews: []string{limited("r1")}}
	if code, _, _, _ := gatedIn(t, dir, first.run); code != exitLimited {
		t.Fatalf("exit %d, want the limit", code)
	}
	base := strings.Repeat("deadbeef", 5)
	second := &fake{t: t, reviews: []string{reviewed("r2")}}
	code, _, out, _ := gatedIn(t, dir, second.run, "--from", "review", "--reviews", "0", "--base", base)
	if code != exitPassed {
		t.Fatalf("exit %d", code)
	}
	events := trailOf(t, out)
	for i, e := range events {
		if e.Seq != i+1 {
			t.Fatalf("event %d has seq %d", i+1, e.Seq)
		}
	}
	if started, stopped := ofKind(events, "GATE_STARTED"), ofKind(events, "STOPPED"); len(started) != 2 || len(stopped) != 2 {
		t.Errorf("%d starts and %d stops, want both steps'", len(started), len(stopped))
	}
	for name, run := range map[string]string{"01-implement.json": "i1", "02-review.json": "r1", "03-review.json": "r2"} {
		if data, err := os.ReadFile(filepath.Join(out, name)); err != nil || !strings.Contains(string(data), `"`+run+`"`) {
			t.Errorf("%s: %v, %s; want run %s's result", name, err, data, run)
		}
	}
}

// A trail that cannot be written stops the step before any run: the gate
// does not act unrecorded.
func TestATrailThatCannotBeWrittenStopsTheStepBeforeAnyRun(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "out", trailFile), 0o755); err != nil {
		t.Fatal(err)
	}
	f := &fake{t: t}
	code, sum, _, _ := gatedIn(t, dir, f.run)
	if code != exitStopped || !strings.Contains(sum.Reason, trailFile) {
		t.Fatalf("exit %d, %+v", code, sum)
	}
	if len(f.ran) != 1 || f.ran[0].command[1] != "rev-parse" {
		t.Errorf("ran %v, want only the base pinned", f.ran)
	}
}

// A result is numbered after every result out keeps, however many digits
// its number has, so that none is written over.
func TestARunsResultIsNumberedAfterEveryResultKept(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	kept := filepath.Join(dir, "out", "100-review.json")
	if err := os.MkdirAll(filepath.Dir(kept), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(kept, []byte("kept"), 0o644); err != nil {
		t.Fatal(err)
	}
	f := &fake{t: t, implements: []string{implementResult("i1", "a")}, reviews: []string{reviewed("r1")}}
	if code, _, _, _ := gatedIn(t, dir, f.run); code != exitPassed {
		t.Fatalf("exit %d", code)
	}
	if data, _ := os.ReadFile(kept); string(data) != "kept" {
		t.Errorf("100-review.json written over: %s", data)
	}
	for name, run := range map[string]string{"101-implement.json": "i1", "102-review.json": "r1"} {
		if data, err := os.ReadFile(filepath.Join(dir, "out", name)); err != nil || !strings.Contains(string(data), `"`+run+`"`) {
			t.Errorf("%s: %v; want run %s's result", name, err, run)
		}
	}
}

// failing is a trail whose first write of an event that holds each of
// match fails, and whose close fails when close is set.
type failing struct {
	io.WriteCloser
	match  []string
	failed bool
	close  bool
}

func (w *failing) Write(p []byte) (int, error) {
	if len(w.match) > 0 && !w.failed {
		matched := true
		for _, m := range w.match {
			matched = matched && strings.Contains(string(p), m)
		}
		if matched {
			w.failed = true
			return 0, errors.New("disk full")
		}
	}
	return w.WriteCloser.Write(p)
}

func (w *failing) Close() error {
	err := w.WriteCloser.Close()
	if w.close {
		return errors.New("disk full")
	}
	return err
}

// A step whose trail fails does not pass, and does nothing after the
// failure: an event of a run that cannot be written, even once, a stop that
// cannot be written, or a trail that cannot be closed, stops it.
func TestAStepWhoseTrailFailsDoesNotPass(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct {
		trail   *failing
		commits int
	}{
		"a run's end": {&failing{match: []string{`"kind":"COMMAND_FINISHED"`, "implement_codex"}}, 0},
		"the stop":    {&failing{match: []string{`"kind":"STOPPED"`}}, 1},
		"the close":   {&failing{close: true}, 1},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			args, out := gateArgs(t, t.TempDir())
			o, err := parse(args, io.Discard)
			if err != nil {
				t.Fatal(err)
			}
			f := &fake{t: t, implements: []string{implementResult("i1", "a")}, reviews: []string{reviewed("r1")}}
			g := gate{options: o, run: f.run, progress: io.Discard, create: func(path string) (io.WriteCloser, error) {
				file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0o644)
				tc.trail.WriteCloser = file
				return tc.trail, err
			}}
			sum := g.drive(context.Background())
			if sum.Status != "stopped" || !strings.Contains(sum.Reason, "disk full") || exitCode(sum.Status) == exitPassed {
				t.Errorf("summary %+v; want a stop for the trail", sum)
			}
			if len(f.commits) != tc.commits {
				t.Errorf("commits %q, want %d", f.commits, tc.commits)
			}
			if _, err := whole(must(os.ReadFile(filepath.Join(out, trailFile)))); err != nil {
				t.Errorf("the trail left is not whole: %v", err)
			}
		})
	}
}

func must(data []byte, err error) []byte {
	if err != nil {
		panic(err)
	}
	return data
}

// A trail a step before left damaged stops the step before any run: the
// gate does not append to it.
func TestADamagedTrailStopsTheStepBeforeAnyRun(t *testing.T) {
	t.Parallel()
	whole := `{"seq":1,"at":"2026-10-14T00:00:00Z","kind":"GATE_STARTED","data":{}}` + "\n"
	for name, kept := range map[string]string{
		"a part of an event": whole + `{"seq":2,"at`,
		"a line not ended":   whole + `{"seq":2,"at":"2026-10-14T00:00:00Z","kind":"STOPPED","data":{}}`,
		"an event skipped":   whole + `{"seq":3,"at":"2026-10-14T00:00:00Z","kind":"STOPPED","data":{}}` + "\n",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			path := filepath.Join(dir, "out", trailFile)
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(kept), 0o644); err != nil {
				t.Fatal(err)
			}
			f := &fake{t: t}
			code, sum, _, _ := gatedIn(t, dir, f.run)
			if code != exitStopped || !strings.Contains(sum.Reason, "is damaged") {
				t.Fatalf("exit %d, %+v", code, sum)
			}
			if len(f.ran) != 1 || f.ran[0].command[1] != "rev-parse" {
				t.Errorf("ran %v, want only the base pinned", f.ran)
			}
			if got, _ := os.ReadFile(path); string(got) != kept {
				t.Errorf("the trail was changed:\n%s", got)
			}
		})
	}
}

// An output directory is a path, not a pattern: a bracket in it is a
// bracket.
func TestAnOutputDirectoryWithABracketIsAPath(t *testing.T) {
	t.Parallel()
	dir := filepath.Join(t.TempDir(), "a[b")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	f := &fake{t: t, implements: []string{implementResult("i1", "a")}, reviews: []string{reviewed("r1")}}
	if code, sum, _, _ := gatedIn(t, dir, f.run); code != exitPassed {
		t.Fatalf("exit %d, %+v", code, sum)
	}
}
