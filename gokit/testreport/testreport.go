// Package testreport turns the events of go test -json into a report that
// says what ran: for each package, how many tests and subtests ran, passed,
// failed and were skipped, the name and reason of every skipped test, and
// the output of every failure in full.
package testreport

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// event is one line of go test -json: a test event (go doc cmd/test2json)
// or a build event (go help buildjson), told apart by its Action. A build
// event names its package by ImportPath, not Package.
type event struct {
	Action      string
	Package     string
	ImportPath  string
	Test        string
	Elapsed     float64
	Output      string
	OutputType  string
	FailedBuild string
}

type test struct {
	name   string
	result string
	output []string
}

type pkg struct {
	path        string
	result      string
	failedBuild string
	elapsed     float64
	output      []string
	tests       []*test
	byName      map[string]*test
}

type build struct {
	path   string
	output []string
}

// tally counts tests by how they ended.
type tally struct {
	Packages, Tests, Subtests, Passed, Failed, Skipped int
}

// report writes to w and keeps the first error a write meets.
type report struct {
	w   io.Writer
	err error
}

func (r *report) printf(format string, args ...any) {
	if r.err == nil {
		_, r.err = fmt.Fprintf(r.w, format, args...)
	}
}

// Write reads go test -json events from events and writes the report to w.
// It reports whether every package passed or had no test files. A line
// that is no event is written as it is, so nothing go test says is lost.
func Write(w io.Writer, events io.Reader) (bool, error) {
	r := &report{w: w}
	var packages []*pkg
	var builds []*build
	seenPackage := map[string]*pkg{}
	seenBuild := map[string]*build{}
	lines := bufio.NewScanner(events)
	lines.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for lines.Scan() {
		var e event
		if err := json.Unmarshal(lines.Bytes(), &e); err != nil || e.Action == "" {
			r.printf("%s\n", lines.Text())
			continue
		}
		if e.Action == "build-output" || e.Action == "build-fail" {
			b := seenBuild[e.ImportPath]
			if b == nil {
				b = &build{path: e.ImportPath}
				seenBuild[e.ImportPath] = b
				builds = append(builds, b)
			}
			if e.Action == "build-output" {
				b.output = append(b.output, e.Output)
			}
			continue
		}
		p := seenPackage[e.Package]
		if p == nil {
			p = &pkg{path: e.Package, byName: map[string]*test{}}
			seenPackage[e.Package] = p
			packages = append(packages, p)
		}
		if e.Test == "" {
			switch e.Action {
			case "output":
				p.output = append(p.output, e.Output)
			case "pass", "fail", "skip":
				p.result, p.elapsed, p.failedBuild = e.Action, e.Elapsed, e.FailedBuild
			}
			continue
		}
		t := p.byName[e.Test]
		if t == nil {
			t = &test{name: e.Test}
			p.byName[e.Test] = t
			p.tests = append(p.tests, t)
		}
		switch e.Action {
		case "output":
			if e.OutputType != "frame" || !strings.HasPrefix(e.Output, "=== ") {
				t.output = append(t.output, e.Output)
			}
		case "pass", "fail", "skip":
			// A test run again (-count) that failed once stays failed.
			if t.result != "fail" {
				t.result = e.Action
			}
		}
	}
	if err := lines.Err(); err != nil {
		return false, err
	}

	ok := true
	shown := map[string]bool{}
	var totals tally
	for _, p := range packages {
		totals.Packages++
		var c tally
		for _, t := range p.tests {
			if strings.Contains(t.name, "/") {
				c.Subtests++
			} else {
				c.Tests++
			}
			switch t.result {
			case "pass":
				c.Passed++
			case "skip":
				c.Skipped++
			default:
				c.Failed++
			}
		}
		totals.Tests += c.Tests
		totals.Subtests += c.Subtests
		totals.Passed += c.Passed
		totals.Failed += c.Failed
		totals.Skipped += c.Skipped

		switch {
		case p.result == "skip" && len(p.tests) == 0:
			r.printf("%s: no test files\n", p.path)
			continue
		case p.result == "pass" && c.Failed == 0:
			r.printf("%s: ok, %s in %.2fs\n", p.path, counts(c), p.elapsed)
		default:
			ok = false
			result := p.result
			if result == "" {
				result = "no result"
			}
			if p.failedBuild != "" {
				result = "the build of " + p.failedBuild + " failed"
			}
			r.printf("%s: FAIL (%s), %s\n", p.path, result, counts(c))
		}
		for _, t := range p.tests {
			if t.result == "skip" {
				r.printf("  skipped %s:%s\n", t.name, reason(t.output))
			}
		}
		for _, t := range p.tests {
			if t.result != "pass" && t.result != "skip" {
				r.printf("  failed %s:\n", t.name)
				r.indented(t.output)
			}
		}
		if p.failedBuild != "" && !shown[p.failedBuild] {
			if b := seenBuild[p.failedBuild]; b != nil {
				r.indented(b.output)
			}
			shown[p.failedBuild] = true
		}
		if p.result != "pass" {
			r.indented(p.output)
		}
	}
	for _, b := range builds {
		if !shown[b.path] && len(b.output) > 0 {
			r.printf("build output of %s:\n", b.path)
			r.indented(b.output)
		}
	}
	r.printf("total: %d packages, %s\n", totals.Packages, counts(totals))
	return ok, r.err
}

func counts(c tally) string {
	return fmt.Sprintf("%d tests and %d subtests: %d passed, %d failed, %d skipped",
		c.Tests, c.Subtests, c.Passed, c.Failed, c.Skipped)
}

// reason is what a skipped test said, its "--- SKIP" line left out.
func reason(output []string) string {
	var said []string
	for _, line := range output {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "--- SKIP") {
			said = append(said, line)
		}
	}
	if len(said) == 0 {
		return " no reason given"
	}
	return " " + strings.Join(said, " ")
}

func (r *report) indented(output []string) {
	for _, line := range output {
		r.printf("    %s", line)
		if !strings.HasSuffix(line, "\n") {
			r.printf("\n")
		}
	}
}
