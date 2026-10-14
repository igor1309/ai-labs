// Package scripts tests gokit's check script, test.sh, run by sh on a copy
// of it, with spies for the go and gofmt it runs.
package scripts

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/fakeproc"
)

// spyEnv set makes the test binary a spy, the one its name picks (go or
// gofmt), instead of running tests.
const spyEnv = "GOKIT_CHECK_SPY"

// What a spy is told by its environment: the copy's root, the directory
// of the records it keeps, the step that fails, and the module whose gofmt
// lists the files it is given as unformatted.
const (
	rootEnv        = "GOKIT_CHECK_ROOT"
	recordsEnv     = "GOKIT_CHECK_RECORDS"
	failEnv        = "GOKIT_CHECK_FAIL"
	unformattedEnv = "GOKIT_CHECK_UNFORMATTED"
)

// The records the spies keep, files in the records directory, a line per
// entry led by the module the spy ran in.
const (
	// stepsRecord is the steps the spies ran.
	stepsRecord = "steps"
	// gofmtRecord is each file gofmt was given.
	gofmtRecord = "gofmt"
	// reportsRecord is what testreport read, quoted.
	reportsRecord = "testreport"
)

// reportMarker leads the line testreport prints, before the module it
// reported on.
const reportMarker = "testreport spy reported"

// stepMarker leads the line each spy's step prints to the check's output
// as it starts, before "<module> <step>": its stdout may be captured by
// the script, its stderr never is.
const stepMarker = "spy step"

// stages are the steps of the check, in order, when every one runs.
var stages = []string{
	"gokit gofmt", "gokit go list", "gokit go vet", "gokit go test", "gokit testreport",
	"gokit/tree gofmt", "gokit/tree go list", "gokit/tree go vet", "gokit/tree go test", "gokit/tree testreport",
}

func TestMain(m *testing.M) {
	if os.Getenv(spyEnv) == "" {
		os.Exit(m.Run())
	}
	spies := map[string]func(fakeproc.Process) int{"go": goSpy, "gofmt": gofmtSpy}
	spy, ok := spies[filepath.Base(os.Args[0])]
	if !ok {
		fmt.Fprintln(os.Stderr, "no spy is named", os.Args[0])
		os.Exit(2)
	}
	fakeproc.Run(spy)
}

// goSpy plays go: list, vet, test, and run of gokit's testreport.
func goSpy(p fakeproc.Process) int {
	args := strings.Join(p.Args, " ")
	switch {
	case args == "list ./...":
		return step(p, "go list", func() error {
			_, err := fmt.Fprintln(p.Stdout, "example.com/m")
			return err
		})
	case args == "vet ./...":
		return step(p, "go vet", func() error { return nil })
	case args == "test -race -count=1 -timeout 1m -json ./...":
		return step(p, "go test", func() error {
			_, err := io.WriteString(p.Stdout, testEvents(module(p, p.Dir)))
			return err
		})
	case len(p.Args) == 4 && p.Args[0] == "-C" && p.Args[2] == "run" && p.Args[3] == "./cmd/testreport":
		if module(p, p.Path(p.Args[1])) != "gokit" {
			fmt.Fprintln(p.Stderr, "testreport is run outside gokit:", p.Args[1])
			return 2
		}
		return step(p, "testreport", func() error {
			events, err := io.ReadAll(p.Stdin)
			if err != nil {
				return err
			}
			if err := record(p, reportsRecord, strconv.Quote(string(events))); err != nil {
				return err
			}
			_, err = fmt.Fprintln(p.Stdout, reportMarker, module(p, p.Dir))
			return err
		})
	}
	fmt.Fprintln(p.Stderr, "go spy: unexpected arguments:", args)
	return 2
}

// testEvents is what go test prints in module: more than one event, so a
// report given a part of them is told from one given all, and each names
// the module, so one module's are told from the other's.
func testEvents(module string) string {
	return fmt.Sprintf(`{"Action":"output","Package":%[1]q,"Output":"ok\n"}`+"\n"+
		`{"Action":"pass","Package":%[1]q}`+"\n", module)
}

// gofmtSpy plays gofmt -l: it records each file it is given, and lists
// them all as unformatted in the module that unformattedEnv names, none
// elsewhere.
func gofmtSpy(p fakeproc.Process) int {
	if len(p.Args) == 0 || p.Args[0] != "-l" {
		fmt.Fprintln(p.Stderr, "gofmt spy: unexpected arguments:", p.Args)
		return 2
	}
	files := p.Args[1:]
	return step(p, "gofmt", func() error {
		for _, file := range files {
			if err := record(p, gofmtRecord, file); err != nil {
				return err
			}
		}
		if module(p, p.Dir) != p.Getenv(unformattedEnv) {
			return nil
		}
		for _, file := range files {
			if _, err := fmt.Fprintln(p.Stdout, file); err != nil {
				return err
			}
		}
		return nil
	})
}

// step records the step as "<module> <name>", prints its marker, and
// then does it: it exits 1 when it is the step that fails, 0 otherwise.
func step(p fakeproc.Process, name string, do func() error) int {
	if err := record(p, stepsRecord, name); err != nil {
		fmt.Fprintln(p.Stderr, err)
		return 2
	}
	if _, err := fmt.Fprintln(p.Stderr, stepMarker, module(p, p.Dir), name); err != nil {
		return 2
	}
	if err := do(); err != nil {
		fmt.Fprintln(p.Stderr, err)
		return 2
	}
	if module(p, p.Dir)+" "+name == p.Getenv(failEnv) {
		return 1
	}
	return 0
}

// record appends entry to the record named, led by the module the spy
// runs in, the one its working directory is.
func record(p fakeproc.Process, name, entry string) error {
	file, err := os.OpenFile(filepath.Join(p.Getenv(recordsEnv), name), os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintln(file, module(p, p.Dir), entry); err != nil {
		file.Close()
		return err
	}
	return file.Close()
}

// module names the module of directory dir in the copy: "gokit" at its
// root, "gokit/<path>" below it. The paths are resolved first, as the
// temporary directory may be reached through a link.
func module(p fakeproc.Process, dir string) string {
	root, err := filepath.EvalSymlinks(p.Getenv(rootEnv))
	if err != nil {
		return "unknown: " + err.Error()
	}
	resolved, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return "unknown: " + err.Error()
	}
	rel, err := filepath.Rel(root, resolved)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "unknown: " + dir
	}
	return filepath.ToSlash(filepath.Join("gokit", rel))
}

// transcript is the check's stage headings and its steps' markers, in
// order, when every stage runs: each module's gofmt heading, its files
// counted, before gofmt runs; vet's, with the packages go list printed,
// after go list and before vet; and go test's before go test and
// testreport. So each heading is tied to the output of its own stage.
var transcript = []string{
	"== gokit gofmt -l: 2 files",
	stepMarker + " gokit gofmt",
	stepMarker + " gokit go list",
	"== gokit go vet ./...: 1 packages",
	stepMarker + " gokit go vet",
	"== gokit go test -race -count=1 -timeout 1m ./...",
	stepMarker + " gokit go test",
	stepMarker + " gokit testreport",
	"== gokit/tree gofmt -l: 2 files",
	stepMarker + " gokit/tree gofmt",
	stepMarker + " gokit/tree go list",
	"== gokit/tree go vet ./...: 1 packages",
	stepMarker + " gokit/tree go vet",
	"== gokit/tree go test -race -count=1 -timeout 1m ./...",
	stepMarker + " gokit/tree go test",
	stepMarker + " gokit/tree testreport",
}

// transcribed is the lines of out that are headings or steps' markers, in
// order.
func transcribed(out string) []string {
	var lines []string
	for line := range strings.Lines(out) {
		if strings.HasPrefix(line, "== ") || strings.HasPrefix(line, stepMarker+" ") {
			lines = append(lines, strings.TrimSuffix(line, "\n"))
		}
	}
	return lines
}

// The check fails when go test or testreport fails in either module, and
// still runs every stage of both, each under its own heading; it passes
// when none fails. In each run gofmt is given each module's own files, its
// packages' at any depth but none of the module inside it, and each
// module's testreport reads all of that module's test events and prints to
// the check's output.
//
// Contract test: test.sh run by sh, with the test binary as its go and
// gofmt.
func TestTheCheckFailsWhenTestsOrTheirReportFail(t *testing.T) {
	t.Parallel()
	gofmtFiles := map[string][]string{
		"gokit":      {"./m.go", "./sub/sub.go"},
		"gokit/tree": {"./node/node.go", "./tree.go"},
	}
	cases := map[string]struct {
		fail   string
		failed bool
	}{
		"none fails":              {"", false},
		"gokit's go test":         {"gokit go test", true},
		"gokit's testreport":      {"gokit testreport", true},
		"gokit/tree's go test":    {"gokit/tree go test", true},
		"gokit/tree's testreport": {"gokit/tree testreport", true},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			run := runCheck(t, c.fail, "")
			if failed := run.err != nil; failed != c.failed {
				t.Errorf("the check failed: %v, want %v (%v); its output:\n%s", failed, c.failed, run.err, run.out)
			}
			if !slices.Equal(run.ran, stages) {
				t.Errorf("the check ran:\n%s\nwant:\n%s", strings.Join(run.ran, "\n"), strings.Join(stages, "\n"))
			}
			if got := transcribed(run.out); !slices.Equal(got, transcript) {
				t.Errorf("the check's headings and steps:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(transcript, "\n"))
			}
			for module, want := range gofmtFiles {
				if got := slices.Sorted(slices.Values(run.gofmt[module])); !slices.Equal(got, want) {
					t.Errorf("gofmt in %s was given %q, want %q", module, got, want)
				}
			}
			if len(run.gofmt) != len(gofmtFiles) {
				t.Errorf("gofmt ran in %d modules, want %d: %q", len(run.gofmt), len(gofmtFiles), run.gofmt)
			}
			for _, module := range []string{"gokit", "gokit/tree"} {
				if got, want := run.reports[module], testEvents(module); got != want {
					t.Errorf("testreport in %s read %q, want %q", module, got, want)
				}
				if marker := reportMarker + " " + module + "\n"; !strings.Contains(run.out, marker) {
					t.Errorf("the check's output lacks testreport's %q:\n%s", marker, run.out)
				}
			}
			if len(run.reports) != 2 {
				t.Errorf("testreport ran in %d modules, want 2: %q", len(run.reports), run.reports)
			}
		})
	}
}

// The check fails, and stops, when gofmt or go vet fails in either module
// or gofmt lists unformatted files, which it names; every stage before
// the one that failed has run, each under its own heading, and nothing
// is headed or run after the step that failed.
//
// Contract test: test.sh run by sh, with the test binary as its go and
// gofmt.
func TestTheCheckStopsWhenFormatOrVetFails(t *testing.T) {
	t.Parallel()
	cases := map[string]struct {
		fail, unformatted string
		ran               []string
	}{
		"gokit's gofmt fails": {
			fail: "gokit gofmt",
			ran:  []string{"gokit gofmt"},
		},
		"gokit's gofmt lists files": {
			unformatted: "gokit",
			ran:         []string{"gokit gofmt"},
		},
		"gokit's go vet fails": {
			fail: "gokit go vet",
			ran:  []string{"gokit gofmt", "gokit go list", "gokit go vet"},
		},
		"gokit/tree's gofmt fails": {
			fail: "gokit/tree gofmt",
			ran:  append(slices.Clone(stages[:5]), "gokit/tree gofmt"),
		},
		"gokit/tree's gofmt lists files": {
			unformatted: "gokit/tree",
			ran:         append(slices.Clone(stages[:5]), "gokit/tree gofmt"),
		},
		"gokit/tree's go vet fails": {
			fail: "gokit/tree go vet",
			ran:  append(slices.Clone(stages[:5]), "gokit/tree gofmt", "gokit/tree go list", "gokit/tree go vet"),
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			run := runCheck(t, c.fail, c.unformatted)
			if run.err == nil {
				t.Errorf("the check passed; its output:\n%s", run.out)
			}
			if !slices.Equal(run.ran, c.ran) {
				t.Errorf("the check ran:\n%s\nwant:\n%s", strings.Join(run.ran, "\n"), strings.Join(c.ran, "\n"))
			}
			last := slices.Index(transcript, stepMarker+" "+c.ran[len(c.ran)-1])
			if got, want := transcribed(run.out), transcript[:last+1]; !slices.Equal(got, want) {
				t.Errorf("the check's headings and steps:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
			}
			if c.unformatted == "" {
				return
			}
			files := run.gofmt[c.unformatted]
			if len(files) == 0 {
				t.Fatalf("gofmt in %s was given no files", c.unformatted)
			}
			if listed := "gofmt needed:\n" + strings.Join(files, "\n") + "\n"; !strings.Contains(run.out, listed) {
				t.Errorf("the check's output lacks %q:\n%s", listed, run.out)
			}
		})
	}
}

// checkRun is what a run of the check did.
type checkRun struct {
	// ran is the steps the spies ran, "<module> <step>".
	ran []string
	// gofmt is the files gofmt was given in each module, in order.
	gofmt map[string][]string
	// reports is what testreport read in each module.
	reports map[string]string
	// out is the script's output, and err its error.
	out string
	err error
}

// runCheck runs a copy of test.sh in a copy of gokit's layout, a module
// with a package below its root and tree a module inside it, with one of
// its own, with the step fail failing and gofmt listing as unformatted the
// files of module unformatted.
func runCheck(t *testing.T, fail, unformatted string) checkRun {
	t.Helper()
	root := t.TempDir()
	script, err := os.ReadFile("test.sh")
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"scripts/test.sh":   string(script),
		"go.mod":            "module example.com/m\n",
		"m.go":              "package m\n",
		"sub/sub.go":        "package sub\n",
		"tree/go.mod":       "module example.com/m/tree\n",
		"tree/tree.go":      "package tree\n",
		"tree/node/node.go": "package node\n",
	}
	for name, content := range files {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	spies := t.TempDir()
	for _, name := range []string{"go", "gofmt"} {
		if err := os.Symlink(self, filepath.Join(spies, name)); err != nil {
			t.Fatal(err)
		}
	}
	records := t.TempDir()
	for _, name := range []string{stepsRecord, gofmtRecord, reportsRecord} {
		if err := os.WriteFile(filepath.Join(records, name), nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}

	command := exec.Command("sh", filepath.Join(root, "scripts", "test.sh"))
	// Built with -race, each spy would otherwise sleep a second as it
	// exits, ten times a run.
	command.Env = append(os.Environ(), "GORACE=atexit_sleep_ms=0",
		"PATH="+spies+string(os.PathListSeparator)+os.Getenv("PATH"),
		spyEnv+"=1", rootEnv+"="+root, recordsEnv+"="+records,
		failEnv+"="+fail, unformattedEnv+"="+unformatted,
	)
	out, err := command.CombinedOutput()
	run := checkRun{gofmt: map[string][]string{}, reports: map[string]string{}, out: string(out), err: err}

	for _, entry := range readRecord(t, filepath.Join(records, stepsRecord)) {
		run.ran = append(run.ran, entry.module+" "+entry.text)
	}
	for _, entry := range readRecord(t, filepath.Join(records, gofmtRecord)) {
		run.gofmt[entry.module] = append(run.gofmt[entry.module], entry.text)
	}
	for _, entry := range readRecord(t, filepath.Join(records, reportsRecord)) {
		events, err := strconv.Unquote(entry.text)
		if err != nil {
			t.Fatalf("testreport's record %q: %v", entry.text, err)
		}
		run.reports[entry.module] += events
	}
	return run
}

// recordEntry is a line of a spy's record: the module it ran in and what
// it recorded there.
type recordEntry struct{ module, text string }

// readRecord reads the record at path.
func readRecord(t *testing.T, path string) []recordEntry {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var entries []recordEntry
	lines := bufio.NewScanner(file)
	for lines.Scan() {
		module, text, ok := strings.Cut(lines.Text(), " ")
		if !ok {
			t.Fatalf("%s: a line without a module: %q", path, lines.Text())
		}
		entries = append(entries, recordEntry{module, text})
	}
	if lines.Err() != nil {
		t.Fatal(lines.Err())
	}
	return entries
}
