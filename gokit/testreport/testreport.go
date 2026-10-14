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

// event is one line of go test -json (cmd/test2json).
type event struct {
	Action     string
	Package    string
	Test       string
	Elapsed    float64
	Output     string
	OutputType string
}

type test struct {
	name   string
	result string
	output []string
}

type pkg struct {
	path    string
	result  string
	elapsed float64
	output  []string
	tests   []*test
	byName  map[string]*test
}

// tally counts tests by how they ended.
type tally struct {
	Packages, Tests, Subtests, Passed, Failed, Skipped int
}

// Write reads go test -json events from events and writes the report to w.
// It reports whether every package passed or had no test files. A line
// that is no event is written as it is, so nothing go test says is lost.
func Write(w io.Writer, events io.Reader) (bool, error) {
	var packages []*pkg
	seen := map[string]*pkg{}
	lines := bufio.NewScanner(events)
	lines.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for lines.Scan() {
		var e event
		if err := json.Unmarshal(lines.Bytes(), &e); err != nil || e.Action == "" {
			fmt.Fprintln(w, lines.Text())
			continue
		}
		p := seen[e.Package]
		if p == nil {
			p = &pkg{path: e.Package, byName: map[string]*test{}}
			seen[e.Package] = p
			packages = append(packages, p)
		}
		if e.Test == "" {
			switch e.Action {
			case "output", "build-output":
				p.output = append(p.output, e.Output)
			case "pass", "fail", "skip":
				p.result, p.elapsed = e.Action, e.Elapsed
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
			t.result = e.Action
		}
	}
	if err := lines.Err(); err != nil {
		return false, err
	}

	ok := true
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
			fmt.Fprintf(w, "%s: no test files\n", p.path)
			continue
		case p.result == "pass" && c.Failed == 0:
			fmt.Fprintf(w, "%s: ok, %s in %.2fs\n", p.path, counts(c), p.elapsed)
		default:
			ok = false
			result := p.result
			if result == "" {
				result = "no result"
			}
			fmt.Fprintf(w, "%s: FAIL (%s), %s\n", p.path, result, counts(c))
		}
		for _, t := range p.tests {
			if t.result == "skip" {
				fmt.Fprintf(w, "  skipped %s:%s\n", t.name, reason(t.output))
			}
		}
		for _, t := range p.tests {
			if t.result != "pass" && t.result != "skip" {
				fmt.Fprintf(w, "  failed %s:\n", t.name)
				writeIndented(w, t.output)
			}
		}
		if p.result != "pass" {
			writeIndented(w, p.output)
		}
	}
	fmt.Fprintf(w, "total: %d packages, %s\n", totals.Packages, counts(totals))
	return ok, nil
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

func writeIndented(w io.Writer, output []string) {
	for _, line := range output {
		fmt.Fprint(w, "    "+line)
		if !strings.HasSuffix(line, "\n") {
			fmt.Fprintln(w)
		}
	}
}
