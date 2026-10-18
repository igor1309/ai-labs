package cli_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

// runs.feature, "A run is exported to the folder given": a relative --to
// is the working directory's, and --to takes its value after "=" too.
func TestARunIsExportedToTheFolderGiven(t *testing.T) {
	t.Parallel()
	cases := []struct {
		args, folder string
	}{
		{"runs export R1 --to /out", "/out"},
		{"runs export R1 --to out", "/work/out"},
		{"--to=out/a runs export R1", "/work/out/a"},
	}
	for _, c := range cases {
		t.Run(c.args, func(t *testing.T) {
			t.Parallel()
			spy := &portSpy{}
			run(t, spy, strings.Fields(c.args)...).expect(t, "", 0)
			if want := []request{{op: "export", id: "R1", to: c.folder}}; !reflect.DeepEqual(spy.requests, want) {
				t.Errorf("requests %+v, want %+v", spy.requests, want)
			}
		})
	}
}

// runs.feature, "An export that fails is printed to stderr and exits 1".
func TestAnExportThatFailsIsPrintedToStderrAndExits1(t *testing.T) {
	t.Parallel()
	got := run(t, &portSpy{err: errors.New(`no run "R1"`)}, "runs", "export", "R1", "--to", "/out")
	if want := (ran{stderr: "agister: no run \"R1\"\n", code: 1}); got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
}

// runs.feature, "A bad runs command prints its usage and exits 2". So do
// --to with no directory, a flag runs does not take, and --to on another
// command.
func TestABadRunsCommandPrintsItsUsageAndExits2(t *testing.T) {
	t.Parallel()
	cases := []string{
		"runs",
		"runs export",
		"runs export R1",
		"runs export --to /out",
		"runs export R1 R2 --to /out",
		"runs show R1",
		"runs export R1 --to",
		"runs export R1 --to=",
		"runs export R1 --to /out --dir /d",
		"runs export R1 --to /out --param a=1",
		"run w --to /out",
		"check --to /out",
	}
	for _, args := range cases {
		t.Run(args, func(t *testing.T) {
			t.Parallel()
			spy := &portSpy{}
			got := run(t, spy, strings.Fields(args)...)
			if got.code != 2 {
				t.Errorf("exit %d, want 2", got.code)
			}
			if !strings.Contains(got.stderr, "\n  agister runs export <run id> --to <directory>\n") {
				t.Errorf("stderr %q, want the usage", got.stderr)
			}
			if got.stdout != "" {
				t.Errorf("stdout %q, want none", got.stdout)
			}
			if spy.requests != nil {
				t.Errorf("the port is asked %+v, want nothing", spy.requests)
			}
		})
	}
}
