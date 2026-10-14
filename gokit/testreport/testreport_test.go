package testreport_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/testreport"
)

const a, b = "example.com/a", "example.com/b"

// stream is go test -json's events, one per line, as test2json writes them.
func stream(t *testing.T, events ...map[string]any) string {
	t.Helper()
	var lines []string
	for _, e := range events {
		line, err := json.Marshal(e)
		if err != nil {
			t.Fatal(err)
		}
		lines = append(lines, string(line))
	}
	return strings.Join(lines, "\n") + "\n"
}

func run(pkg, test string) map[string]any {
	return map[string]any{"Action": "run", "Package": pkg, "Test": test}
}

func ended(action, pkg, test string) map[string]any {
	return map[string]any{"Action": action, "Package": pkg, "Test": test}
}

func said(pkg, test, output string) map[string]any {
	return map[string]any{"Action": "output", "Package": pkg, "Test": test, "Output": output}
}

func frame(pkg, test, output string) map[string]any {
	return map[string]any{"Action": "output", "Package": pkg, "Test": test, "Output": output, "OutputType": "frame"}
}

func pkgEnded(action, pkg string, elapsed float64) map[string]any {
	return map[string]any{"Action": action, "Package": pkg, "Elapsed": elapsed}
}

func report(t *testing.T, events string) (string, bool) {
	t.Helper()
	var out strings.Builder
	ok, err := testreport.Write(&out, strings.NewReader(events))
	if err != nil {
		t.Fatal(err)
	}
	return out.String(), ok
}

func TestAPassingPackageSaysHowManyTestsAndSubtestsRan(t *testing.T) {
	t.Parallel()
	out, ok := report(t, stream(t,
		run(a, "TestOne"), ended("pass", a, "TestOne"),
		run(a, "TestTwo"), run(a, "TestTwo/case"), ended("pass", a, "TestTwo/case"), ended("pass", a, "TestTwo"),
		pkgEnded("pass", a, 1.5),
	))
	want := "example.com/a: ok, 2 tests and 1 subtests: 3 passed, 0 failed, 0 skipped in 1.50s\n" +
		"total: 1 packages, 2 tests and 1 subtests: 3 passed, 0 failed, 0 skipped\n"
	if out != want || !ok {
		t.Errorf("got ok %v and\n%s\nwant ok and\n%s", ok, out, want)
	}
}

func TestASkippedTestIsNamedWithItsReason(t *testing.T) {
	t.Parallel()
	out, ok := report(t, stream(t,
		run(a, "TestSlow"),
		frame(a, "TestSlow", "=== RUN   TestSlow\n"),
		said(a, "TestSlow", "    slow_test.go:9: needs a network\n"),
		frame(a, "TestSlow", "--- SKIP: TestSlow (0.00s)\n"),
		ended("skip", a, "TestSlow"),
		pkgEnded("pass", a, 0.1),
	))
	if !ok {
		t.Error("a skipped test failed the report")
	}
	for _, want := range []string{
		"example.com/a: ok, 1 tests and 0 subtests: 0 passed, 0 failed, 1 skipped in 0.10s\n",
		"  skipped TestSlow: slow_test.go:9: needs a network\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("the report has no %q:\n%s", want, out)
		}
	}
}

func TestAPackageWithoutTestFilesSaysSo(t *testing.T) {
	t.Parallel()
	out, ok := report(t, stream(t,
		said(a, "", "?   \texample.com/a\t[no test files]\n"),
		pkgEnded("skip", a, 0),
	))
	if !ok || !strings.HasPrefix(out, "example.com/a: no test files\n") {
		t.Errorf("got ok %v and\n%s", ok, out)
	}
}

func TestAFailedTestFailsTheReportWithItsOutputInFull(t *testing.T) {
	t.Parallel()
	out, ok := report(t, stream(t,
		run(a, "TestGood"), ended("pass", a, "TestGood"),
		run(a, "TestBad"),
		said(a, "TestBad", "    bad_test.go:7: got 1\n"),
		said(a, "TestBad", "        want 2\n"),
		ended("fail", a, "TestBad"),
		pkgEnded("fail", a, 0.2),
		run(b, "TestFine"), ended("pass", b, "TestFine"),
		pkgEnded("pass", b, 0.3),
	))
	if ok {
		t.Error("a failed test passed the report")
	}
	for _, want := range []string{
		"example.com/a: FAIL (fail), 2 tests and 0 subtests: 1 passed, 1 failed, 0 skipped\n" +
			"  failed TestBad:\n" +
			"        bad_test.go:7: got 1\n" +
			"            want 2\n",
		"example.com/b: ok, 1 tests and 0 subtests: 1 passed, 0 failed, 0 skipped in 0.30s\n",
		"total: 2 packages, 3 tests and 0 subtests: 2 passed, 1 failed, 0 skipped\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("the report has no %q:\n%s", want, out)
		}
	}
}

// A test with no end, as when the binary panics or times out, counts as
// failed: it did not pass.
func TestATestThatNeverEndedCountsAsFailed(t *testing.T) {
	t.Parallel()
	out, ok := report(t, stream(t,
		run(a, "TestHangs"),
		said(a, "", "panic: test timed out after 1m0s\n"),
		pkgEnded("fail", a, 60),
	))
	if ok {
		t.Error("a test that never ended passed the report")
	}
	for _, want := range []string{"1 failed", "  failed TestHangs:\n", "    panic: test timed out after 1m0s\n"} {
		if !strings.Contains(out, want) {
			t.Errorf("the report has no %q:\n%s", want, out)
		}
	}
}

func TestAPackageThatDidNotBuildFailsTheReportWithTheBuildOutput(t *testing.T) {
	t.Parallel()
	out, ok := report(t, stream(t,
		map[string]any{"Action": "build-output", "Package": a, "Output": "a.go:3:1: syntax error\n"},
		pkgEnded("fail", a, 0),
	))
	if ok {
		t.Error("a package that did not build passed the report")
	}
	want := "example.com/a: FAIL (fail), 0 tests and 0 subtests: 0 passed, 0 failed, 0 skipped\n" +
		"    a.go:3:1: syntax error\n"
	if !strings.HasPrefix(out, want) {
		t.Errorf("got\n%s\nwant it to start\n%s", out, want)
	}
}

func TestALineThatIsNoEventIsWrittenAsItIs(t *testing.T) {
	t.Parallel()
	out, _ := report(t, "go: downloading example.com/c v1.0.0\n"+stream(t, pkgEnded("skip", a, 0)))
	if !strings.HasPrefix(out, "go: downloading example.com/c v1.0.0\n") {
		t.Errorf("the line is lost:\n%s", out)
	}
}

func TestAPackageWithoutAResultFailsTheReport(t *testing.T) {
	t.Parallel()
	out, ok := report(t, stream(t, run(a, "TestOne"), ended("pass", a, "TestOne")))
	if ok || !strings.Contains(out, "example.com/a: FAIL (no result)") {
		t.Errorf("got ok %v and\n%s", ok, out)
	}
}
