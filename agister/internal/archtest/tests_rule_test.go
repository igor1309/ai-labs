package archtest

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// The module's own tests keep ADR-017's marker and parallelism, by the
// rule testFindings documents.
func TestTestsKeepTheMarkerAndTheParallelism(t *testing.T) {
	t.Parallel()
	findings, err := testFindings("../..")
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) > 0 {
		t.Error(strings.Join(findings, "\n"))
	}
}

// findingsIn is what testFindings says of a directory holding the files.
func findingsIn(t *testing.T, files map[string]string) []string {
	t.Helper()
	root := t.TempDir()
	for name, source := range files {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	findings, err := testFindings(root)
	if err != nil {
		t.Fatal(err)
	}
	return findings
}

const unmarked = ` and has no "Contract test:" line in its doc comment`

// A test that uses real machinery without the marker is a finding, in its
// body or through the declarations of its directory's test files.
func TestATestUsingRealMachineryOwesTheMarker(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		files map[string]string
		want  []string
	}{
		"a process started in the body": {
			map[string]string{"a_test.go": `package a

import (
	"os/exec"
	"testing"
)

// It runs true.
func TestA(t *testing.T) {
	t.Parallel()
	exec.Command("true").Run()
}
`},
			[]string{"a_test.go:9: TestA uses exec.Command" + unmarked},
		},
		"a timer in a subtest": {
			map[string]string{"a_test.go": `package a

import (
	"testing"
	"time"
)

func TestA(t *testing.T) {
	t.Parallel()
	t.Run("sub", func(t *testing.T) {
		select {
		case <-time.After(time.Second):
		}
	})
}
`},
			[]string{"a_test.go:8: TestA uses time.After" + unmarked},
		},
		"an import under another name": {
			map[string]string{"a_test.go": `package a

import (
	"testing"
	clock "time"
)

func TestA(t *testing.T) {
	t.Parallel()
	clock.Sleep(clock.Second)
}
`},
			[]string{"a_test.go:8: TestA uses clock.Sleep" + unmarked},
		},
		"a build of a fake": {
			map[string]string{"a_test.go": `package a

import (
	"testing"

	"` + module + `/internal/adapters/runtime/runtimetest"
)

func TestA(t *testing.T) {
	t.Parallel()
	runtimetest.Binary(t, "fake")
}
`},
			[]string{"a_test.go:9: TestA uses runtimetest.Binary" + unmarked},
		},
		"through a helper of another test file": {
			map[string]string{
				"a_test.go": `package a

import "testing"

func TestA(t *testing.T) {
	t.Parallel()
	serve(t)
}
`,
				"helpers_test.go": `package a

import (
	"net"
	"testing"
)

func serve(t *testing.T) { listen(t) }

func listen(t *testing.T) {
	if _, err := net.Listen("tcp", "127.0.0.1:0"); err != nil {
		t.Fatal(err)
	}
}
`},
			[]string{"a_test.go:5: TestA uses net.Listen (through serve, listen)" + unmarked},
		},
		"through a helper named and not called": {
			map[string]string{"a_test.go": `package a

import (
	"testing"
	"time"
)

func pause() { time.Sleep(time.Millisecond) }

func TestA(t *testing.T) {
	t.Parallel()
	t.Cleanup(pause)
}
`},
			[]string{"a_test.go:10: TestA uses time.Sleep (through pause)" + unmarked},
		},
		"through a method of a type the test names": {
			map[string]string{"a_test.go": `package a

import (
	"testing"
	"time"
)

type spy struct{ done chan struct{} }

// wait is called by the code under test, never by the test.
func (s *spy) wait() {
	select {
	case <-s.done:
	case <-time.After(5 * time.Second):
	}
}

func TestA(t *testing.T) {
	t.Parallel()
	use(&spy{})
}

func use(any) {}
`},
			[]string{"a_test.go:18: TestA uses time.After (through spy)" + unmarked},
		},
		"through a harness's field": {
			map[string]string{"a_test.go": `package a

import (
	"context"
	"testing"
	"time"
)

type harness struct{ runner *runner }

type runner struct{}

func (runner) run() {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	<-ctx.Done()
}

func newHarness() *harness { return nil }

func TestA(t *testing.T) {
	t.Parallel()
	newHarness()
}
`},
			[]string{"a_test.go:21: TestA uses context.WithTimeout (through newHarness, harness, runner)" + unmarked},
		},
		"through a variable's initial value": {
			map[string]string{"a_test.go": `package a

import (
	"net/http/httptest"
	"testing"
)

var server = httptest.NewServer(nil)

func TestA(t *testing.T) {
	t.Parallel()
	_ = server.URL
}
`},
			[]string{"a_test.go:10: TestA uses httptest.NewServer (through server)" + unmarked},
		},
		"a marker that says nothing": {
			map[string]string{"a_test.go": `package a

import (
	"os/exec"
	"testing"
)

// Contract test:
func TestA(t *testing.T) {
	t.Parallel()
	exec.Command("true").Run()
}
`},
			[]string{"a_test.go:9: TestA uses exec.Command" + unmarked},
		},
		"a marker outside the doc comment": {
			map[string]string{"a_test.go": `package a

import (
	"os/exec"
	"testing"
)

func TestA(t *testing.T) {
	t.Parallel()
	// Contract test: the real true.
	exec.Command("true").Run()
}
`},
			[]string{"a_test.go:8: TestA uses exec.Command" + unmarked},
		},
		"marked": {
			map[string]string{"a_test.go": `package a

import (
	"os/exec"
	"testing"
	"time"
)

func pause() { time.Sleep(time.Millisecond) }

// It runs true.
//
// Contract test: the real true, and the wall clock between two runs.
func TestA(t *testing.T) {
	t.Parallel()
	exec.Command("true").Run()
	pause()
}
`},
			nil,
		},
		"no real machinery": {
			map[string]string{"a_test.go": `package a

import (
	"testing"
	"time"
)

type clock struct{ now time.Time }

func (c *clock) After(d time.Duration) <-chan time.Time { return nil }

func pause() { time.Sleep(time.Millisecond) }

// pause is declared and not reached.
func TestA(t *testing.T) {
	t.Parallel()
	c := &clock{now: time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC)}
	<-c.After(time.Second)
}
`},
			nil,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := findingsIn(t, c.files); !slices.Equal(got, c.want) {
				t.Fatalf("findings:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(c.want, "\n"))
			}
		})
	}
}

// What testFindings does not follow, as its comment says: a local name
// that hides a declaration, a field's or a method's name, another package
// and a file that is not a test file.
func TestWhatATestIsNotFollowedThrough(t *testing.T) {
	t.Parallel()
	const helper = `
func wait() { time.Sleep(time.Millisecond) }
`
	for name, body := range map[string]string{
		"a local name hiding a helper": `	wait := func() {}
	wait()`,
		"a parameter hiding a helper": `	func(wait func()) { wait() }(func() {})`,
		"a method's name": `	var group interface{ wait() }
	if group != nil {
		group.wait()
	}`,
		"a field's name in a literal": `	_ = struct{ wait bool }{wait: true}`,
		"a local name hiding an import": `	time := struct{ Sleep func() }{func() {}}
	time.Sleep()`,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			files := map[string]string{
				"a_test.go":       "package a\n\nimport \"testing\"\n\nfunc TestA(t *testing.T) {\n\tt.Parallel()\n" + body + "\n}\n",
				"helpers_test.go": "package a\n\nimport \"time\"\n" + helper,
			}
			if got := findingsIn(t, files); len(got) != 0 {
				t.Fatalf("findings:\n%s", strings.Join(got, "\n"))
			}
			// The helper called is followed: the cases above are not
			// silent for another reason.
			files["a_test.go"] = "package a\n\nimport \"testing\"\n\nfunc TestA(t *testing.T) {\n\tt.Parallel()\n\twait()\n}\n"
			want := []string{"a_test.go:5: TestA uses time.Sleep (through wait)" + unmarked}
			if got := findingsIn(t, files); !slices.Equal(got, want) {
				t.Fatalf("findings:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
			}
		})
	}

	t.Run("a file that is not a test file, and another package", func(t *testing.T) {
		t.Parallel()
		got := findingsIn(t, map[string]string{
			"a_test.go": `package a

import (
	"testing"

	"example.com/b"
)

func TestA(t *testing.T) {
	t.Parallel()
	start()
	b.Start()
}
`,
			"a.go": `package a

import "os/exec"

func start() { exec.Command("true").Run() }
`,
			"b/b.go": `package b

import "os/exec"

func Start() { exec.Command("true").Run() }
`,
		})
		if len(got) != 0 {
			t.Fatalf("findings:\n%s", strings.Join(got, "\n"))
		}
	})
}

// A top-level test starts with t.Parallel() or says "Serial:" and why in
// its doc comment, and never both.
func TestATestOwesParallelOrSerial(t *testing.T) {
	t.Parallel()
	const neither = ` neither starts with t.Parallel() nor has a "Serial:" line in its doc comment`
	for name, c := range map[string]struct {
		test string // from line 5 of a_test.go
		want []string
	}{
		"parallel first": {`func TestA(t *testing.T) {
	t.Parallel()
	t.Log("a")
}`, nil},
		"parallel, the parameter under another name": {`func TestA(test *testing.T) {
	test.Parallel()
}`, nil},
		"serial with its reason": {`// Serial: t.Setenv.
func TestA(t *testing.T) {
	t.Setenv("A", "a")
}`, nil},
		"neither": {`func TestA(t *testing.T) {
	t.Log("a")
}`, []string{"a_test.go:5: TestA" + neither}},
		"an empty test": {`func TestA(t *testing.T) {}`, []string{"a_test.go:5: TestA" + neither}},
		"parallel after another statement": {`func TestA(t *testing.T) {
	t.Log("a")
	t.Parallel()
}`, []string{"a_test.go:5: TestA" + neither}},
		"parallel only in a subtest": {`func TestA(t *testing.T) {
	t.Run("sub", func(t *testing.T) { t.Parallel() })
}`, []string{"a_test.go:5: TestA" + neither}},
		"serial without a reason": {`// Serial:
func TestA(t *testing.T) {
	t.Setenv("A", "a")
}`, []string{"a_test.go:6: TestA" + neither}},
		"serial outside the doc comment": {`func TestA(t *testing.T) {
	// Serial: t.Setenv.
	t.Setenv("A", "a")
}`, []string{"a_test.go:5: TestA" + neither}},
		"both": {`// Serial: t.Setenv.
func TestA(t *testing.T) {
	t.Parallel()
}`, []string{`a_test.go:6: TestA starts with t.Parallel() and has a "Serial:" line`}},
		"what is not a top-level test": {`func TestMain(m *testing.M) {}

func TestHelper(t *testing.T, name string) {}

func Testing() {}

type suite struct{}

func (suite) TestA(t *testing.T) {}

func helper(t *testing.T) {}`, nil},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			got := findingsIn(t, map[string]string{"a_test.go": "package a\n\nimport \"testing\"\n\n" + c.test + "\n"})
			if !slices.Equal(got, c.want) {
				t.Fatalf("findings:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(c.want, "\n"))
			}
		})
	}
}

// Every directory under the root is checked on its own, a finding names its
// file from the root, and testdata is not checked.
func TestTestFilesAreFoundUnderTheRoot(t *testing.T) {
	t.Parallel()
	const serial = "package a\n\nimport \"testing\"\n\nfunc TestA(t *testing.T) {}\n"
	got := findingsIn(t, map[string]string{
		"internal/a/a_test.go":          serial,
		"internal/a/testdata/a_test.go": serial,
		"internal/a/a.go":               serial,
		// The same name in another directory is another declaration.
		"internal/b/b_test.go": `package b

import "testing"

func TestB(t *testing.T) {
	t.Parallel()
	wait()
}

func wait() {}
`,
		"internal/c/c_test.go": `package c

import "time"

func wait() { time.Sleep(time.Millisecond) }
`,
	})
	want := []string{`internal/a/a_test.go:5: TestA neither starts with t.Parallel() nor has a "Serial:" line in its doc comment`}
	if !slices.Equal(got, want) {
		t.Fatalf("findings:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}
