// Package deploy tests the LaunchAgent scripts for `agister pages`. They run
// with HOME in a temp directory and a launchctl shim first on PATH, so the
// real ~/Library/LaunchAgents and launchctl are never touched.
package deploy

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

const label = "com.igormalyarov.agister-pages"

// shim is a launchctl that appends one line per call to calls.log: the
// argument count, then each argument in brackets (see call). It answers
// `print` as loaded only while the loaded marker exists, and fails bootstrap
// or bootout while a fail-bootstrap or fail-bootout marker exists.
const shim = `#!/bin/sh
{ printf '%%s' "$#"; for a; do printf ' [%%s]' "$a"; done; echo; } >> '%[1]s/calls.log'
case $1 in
print) [ -e '%[1]s/loaded' ] || exit 113 ;;
bootstrap) [ ! -e '%[1]s/fail-bootstrap' ] || exit 5; : > '%[1]s/loaded' ;;
bootout) [ ! -e '%[1]s/fail-bootout' ] || exit 5; rm -f '%[1]s/loaded' ;;
esac
exit 0
`

// call is the calls.log line the shim writes for one invocation.
func call(args ...string) string {
	line := fmt.Sprint(len(args))
	for _, a := range args {
		line += " [" + a + "]"
	}
	return line
}

// box is one test's world: a HOME, the shim's directory and the PATH the
// scripts run with.
type box struct {
	t    *testing.T
	home string
	shim string
	path string
}

func newBox(t *testing.T) *box { return newBoxHome(t, "home & <x>") }

// newBoxHome is newBox with HOME named name inside the temp directory.
func newBoxHome(t *testing.T, name string) *box {
	t.Helper()
	root := t.TempDir()
	b := &box{t: t, home: filepath.Join(root, name), shim: filepath.Join(root, "shim")}
	for _, dir := range []string{b.home, b.shim} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(b.shim, "launchctl"), []byte(fmt.Sprintf(shim, b.shim)), 0o755); err != nil {
		t.Fatal(err)
	}
	b.path = b.shim + ":/odd&dir/<bin>:" + os.Getenv("PATH")
	return b
}

func (b *box) plist() string {
	return filepath.Join(b.home, "Library", "LaunchAgents", label+".plist")
}

func (b *box) agister() string { return filepath.Join(b.home, ".local", "bin", "agister") }

// installBinary writes a fake agister that leaves a marker if it is ever run.
func (b *box) installBinary() {
	b.t.Helper()
	if err := os.MkdirAll(filepath.Dir(b.agister()), 0o755); err != nil {
		b.t.Fatal(err)
	}
	script := fmt.Sprintf("#!/bin/sh\n: > '%s/agister-ran'\n", b.shim)
	if err := os.WriteFile(b.agister(), []byte(script), 0o755); err != nil {
		b.t.Fatal(err)
	}
}

func (b *box) setLoaded() { b.mark("loaded") }

// mark creates a shim marker: loaded, fail-bootstrap or fail-bootout.
func (b *box) mark(name string) {
	b.t.Helper()
	if err := os.WriteFile(filepath.Join(b.shim, name), nil, 0o644); err != nil {
		b.t.Fatal(err)
	}
}

// calls is the launchctl invocations, one per line.
func (b *box) calls() []string {
	b.t.Helper()
	data, err := os.ReadFile(filepath.Join(b.shim, "calls.log"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		b.t.Fatal(err)
	}
	return strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
}

func (b *box) job() string { return fmt.Sprintf("gui/%d/%s", os.Getuid(), label) }

func (b *box) bootstrapCall() string {
	return call("bootstrap", fmt.Sprintf("gui/%d", os.Getuid()), b.plist())
}

func (b *box) logs() string { return filepath.Join(b.home, "Library", "Logs", "agister") }

// writePlist writes an earlier plist with content data.
func (b *box) writePlist(data string) {
	b.t.Helper()
	if err := os.MkdirAll(filepath.Dir(b.plist()), 0o755); err != nil {
		b.t.Fatal(err)
	}
	if err := os.WriteFile(b.plist(), []byte(data), 0o644); err != nil {
		b.t.Fatal(err)
	}
}

// assertPlist checks the plist holds want and nothing else is left in its
// directory.
func (b *box) assertPlist(want string) {
	b.t.Helper()
	data, err := os.ReadFile(b.plist())
	if err != nil {
		b.t.Fatalf("plist: %v", err)
	}
	if string(data) != want {
		b.t.Errorf("plist %q, want %q", data, want)
	}
	b.assertOnlyPlist()
}

// assertOnlyPlist checks no temp or backup file is left beside the plist.
func (b *box) assertOnlyPlist() {
	b.t.Helper()
	entries, err := os.ReadDir(filepath.Dir(b.plist()))
	if err != nil {
		b.t.Fatal(err)
	}
	for _, e := range entries {
		if e.Name() != label+".plist" {
			b.t.Errorf("%s left in LaunchAgents", e.Name())
		}
	}
}

// assertRefused checks a script exited 1 with one line on stderr that
// starts with prefix and holds about, and printed nothing on stdout.
func (b *box) assertRefused(stdout, stderr string, code int, prefix, about string) {
	b.t.Helper()
	if code != 1 {
		b.t.Errorf("exit %d, want 1", code)
	}
	if lines := strings.Split(strings.TrimSuffix(stderr, "\n"), "\n"); len(lines) != 1 || !strings.HasPrefix(lines[0], prefix) || !strings.Contains(lines[0], about) {
		b.t.Errorf("stderr %q, want one %s line about %q", stderr, prefix, about)
	}
	if stdout != "" {
		b.t.Errorf("stdout %q, want none", stdout)
	}
}

// run runs a script with only HOME and PATH set; it returns stdout, stderr
// and the exit code.
func (b *box) run(script string) (string, string, int) {
	b.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "/bin/sh", script)
	cmd.Env = []string{"HOME=" + b.home, "PATH=" + b.path}
	var stdout, stderr strings.Builder
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	code := 0
	var exit *exec.ExitError
	switch {
	case errors.As(err, &exit):
		code = exit.ExitCode()
	case err != nil:
		b.t.Fatalf("%s: %v", script, err)
	}
	return stdout.String(), stderr.String(), code
}

func (b *box) assertNotExist(path string) {
	b.t.Helper()
	if _, err := os.Lstat(path); !errors.Is(err, os.ErrNotExist) {
		b.t.Errorf("%s exists (err %v), want absent", path, err)
	}
}

func TestInstallRendersAndBootstrapsOnce(t *testing.T) {
	b := newBox(t)
	b.installBinary()

	stdout, stderr, code := b.run("install.sh")
	if code != 0 {
		t.Fatalf("install exit %d, stderr %q", code, stderr)
	}
	if !strings.Contains(stdout, "http://127.0.0.1:7465/") {
		t.Errorf("stdout %q lacks the page URL", stdout)
	}
	want := []string{call("print", b.job()), b.bootstrapCall()}
	if got := b.calls(); !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertNotExist(filepath.Join(b.shim, "agister-ran"))
	b.assertOnlyPlist()

	data := b.assertRendered()
	if !strings.Contains(string(data), "home &amp; &lt;x&gt;") || !strings.Contains(string(data), "/odd&amp;dir/&lt;bin&gt;") {
		t.Errorf("HOME and PATH are not XML-escaped:\n%s", data)
	}
	b.assertLogsMode()
	b.assertPlistMode()
}

// assertPlistMode checks the installed plist is 0644.
func (b *box) assertPlistMode() {
	b.t.Helper()
	info, err := os.Stat(b.plist())
	if err != nil {
		b.t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o644 {
		b.t.Errorf("%s mode %o, want 644", b.plist(), perm)
	}
}

// assertRendered checks the installed plist lints and holds the paths from
// HOME and PATH; it returns the plist's bytes.
func (b *box) assertRendered() []byte {
	b.t.Helper()
	if _, err := exec.LookPath("plutil"); err == nil {
		if out, err := exec.Command("plutil", "-lint", b.plist()).CombinedOutput(); err != nil {
			b.t.Errorf("plutil -lint: %v: %s", err, out)
		}
	}
	data, err := os.ReadFile(b.plist())
	if err != nil {
		b.t.Fatal(err)
	}
	got, err := decodePlist(string(data))
	if err != nil {
		b.t.Fatalf("plist does not parse: %v\n%s", err, data)
	}
	want := map[string]any{
		"Label":                label,
		"ProgramArguments":     []any{b.agister(), "pages", "--no-open"},
		"RunAtLoad":            true,
		"KeepAlive":            true,
		"EnvironmentVariables": map[string]any{"PATH": b.path},
		"StandardOutPath":      filepath.Join(b.logs(), "pages.out.log"),
		"StandardErrorPath":    filepath.Join(b.logs(), "pages.err.log"),
	}
	if !reflect.DeepEqual(got, want) {
		b.t.Errorf("plist\n got %#v\nwant %#v", got, want)
	}
	return data
}

func (b *box) assertLogsMode() {
	b.t.Helper()
	info, err := os.Stat(b.logs())
	if err != nil {
		b.t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o700 {
		b.t.Errorf("%s mode %o, want 700", b.logs(), perm)
	}
}

func TestInstallRendersHomeHoldingAToken(t *testing.T) {
	b := newBoxHome(t, "@PATH@ @HOME@")
	b.installBinary()
	if _, stderr, code := b.run("install.sh"); code != 0 {
		t.Fatalf("install exit %d, stderr %q", code, stderr)
	}
	b.assertRendered()
}

func TestInstallSetsAnExistingLogDirTo0700(t *testing.T) {
	b := newBox(t)
	b.installBinary()
	if err := os.MkdirAll(b.logs(), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(b.logs(), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, stderr, code := b.run("install.sh"); code != 0 {
		t.Fatalf("install exit %d, stderr %q", code, stderr)
	}
	b.assertLogsMode()
}

func TestInstallOverAPlistWhoseJobIsNotLoadedReplacesIt(t *testing.T) {
	b := newBox(t)
	b.installBinary()
	b.writePlist("previous")
	if _, stderr, code := b.run("install.sh"); code != 0 {
		t.Fatalf("install exit %d, stderr %q", code, stderr)
	}
	if got, want := b.calls(), []string{call("print", b.job()), b.bootstrapCall()}; !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertRendered()
	b.assertPlistMode()
	b.assertOnlyPlist()
}

func TestInstallLogSetupFailureKeepsThePreviousPlist(t *testing.T) {
	b := newBox(t)
	b.installBinary()
	b.writePlist("previous")
	if err := os.MkdirAll(filepath.Dir(b.logs()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(b.logs(), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	stdout, stderr, code := b.run("install.sh")
	b.assertRefused(stdout, stderr, code, "install: ", b.logs())
	if got, want := b.calls(), []string{call("print", b.job())}; !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertPlist("previous")
}

func TestInstallBootstrapFailureRestoresThePreviousPlist(t *testing.T) {
	b := newBox(t)
	b.installBinary()
	b.writePlist("previous")
	b.mark("fail-bootstrap")
	stdout, stderr, code := b.run("install.sh")
	b.assertRefused(stdout, stderr, code, "install: ", "bootstrap")
	if got, want := b.calls(), []string{call("print", b.job()), b.bootstrapCall()}; !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertPlist("previous")
}

func TestInstallBootstrapFailureWithNoPreviousPlistRemovesTheNewOne(t *testing.T) {
	b := newBox(t)
	b.installBinary()
	b.mark("fail-bootstrap")
	stdout, stderr, code := b.run("install.sh")
	b.assertRefused(stdout, stderr, code, "install: ", "bootstrap")
	if got, want := b.calls(), []string{call("print", b.job()), b.bootstrapCall()}; !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertNotExist(b.plist())
	b.assertOnlyPlist()
}

func TestInstallRefuses(t *testing.T) {
	for _, tc := range []struct {
		name  string
		setup func(b *box)
		want  []string
	}{
		{"no binary", func(b *box) {}, nil},
		{"binary not executable", func(b *box) {
			b.installBinary()
			if err := os.Chmod(b.agister(), 0o644); err != nil {
				b.t.Fatal(err)
			}
		}, nil},
		{"binary is a directory", func(b *box) {
			if err := os.MkdirAll(b.agister(), 0o755); err != nil {
				b.t.Fatal(err)
			}
		}, nil},
		{"already loaded", func(b *box) { b.installBinary(); b.setLoaded() }, []string{"print"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := newBox(t)
			tc.setup(b)
			stdout, stderr, code := b.run("install.sh")
			if code != 1 {
				t.Errorf("exit %d, want 1 (stdout %q)", code, stdout)
			}
			if lines := strings.Split(strings.TrimSuffix(stderr, "\n"), "\n"); len(lines) != 1 || !strings.HasPrefix(lines[0], "install: ") {
				t.Errorf("stderr %q, want one install: line", stderr)
			}
			var want []string
			for _, verb := range tc.want {
				want = append(want, call(verb, b.job()))
			}
			if got := b.calls(); !reflect.DeepEqual(got, want) {
				t.Errorf("launchctl calls %q, want %q", got, want)
			}
			b.assertNotExist(filepath.Join(b.home, "Library"))
			b.assertNotExist(filepath.Join(b.shim, "agister-ran"))
		})
	}
}

func TestUninstallBootsOutAndRemovesPlist(t *testing.T) {
	b := newBox(t)
	b.installBinary()
	if _, stderr, code := b.run("install.sh"); code != 0 {
		t.Fatalf("install exit %d, stderr %q", code, stderr)
	}
	kept := map[string][]byte{
		filepath.Join(b.logs(), "pages.out.log"): []byte("served\n"),
		filepath.Join(b.logs(), "pages.err.log"): []byte("warned\n"),
	}
	for path, data := range kept {
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	bin, err := os.ReadFile(b.agister())
	if err != nil {
		t.Fatal(err)
	}
	kept[b.agister()] = bin
	if err := os.Remove(filepath.Join(b.shim, "calls.log")); err != nil {
		t.Fatal(err)
	}

	if _, stderr, code := b.run("uninstall.sh"); code != 0 {
		t.Fatalf("uninstall exit %d, stderr %q", code, stderr)
	}
	want := []string{call("print", b.job()), call("bootout", b.job())}
	if got := b.calls(); !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertNotExist(b.plist())
	for path, want := range kept {
		got, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("%s not left in place: %v", path, err)
		} else if string(got) != string(want) {
			t.Errorf("%s holds %q, want %q", path, got, want)
		}
	}
	if info, err := os.Stat(b.agister()); err != nil {
		t.Error(err)
	} else if !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		t.Errorf("%s mode %v, want an executable file", b.agister(), info.Mode())
	}
}

func TestUninstallRemovesAPlistWhoseJobIsNotLoaded(t *testing.T) {
	b := newBox(t)
	b.writePlist("installed")
	if _, stderr, code := b.run("uninstall.sh"); code != 0 {
		t.Fatalf("uninstall exit %d, stderr %q", code, stderr)
	}
	if got, want := b.calls(), []string{call("print", b.job())}; !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertNotExist(b.plist())
}

func TestUninstallBootoutFailureKeepsThePlist(t *testing.T) {
	b := newBox(t)
	b.writePlist("installed")
	b.setLoaded()
	b.mark("fail-bootout")
	stdout, stderr, code := b.run("uninstall.sh")
	b.assertRefused(stdout, stderr, code, "uninstall: ", "bootout")
	if got, want := b.calls(), []string{call("print", b.job()), call("bootout", b.job())}; !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertPlist("installed")
}

func TestUninstallWithNothingInstalledSucceeds(t *testing.T) {
	b := newBox(t)
	if _, stderr, code := b.run("uninstall.sh"); code != 0 {
		t.Fatalf("uninstall exit %d, stderr %q", code, stderr)
	}
	want := []string{call("print", b.job())}
	if got := b.calls(); !reflect.DeepEqual(got, want) {
		t.Errorf("launchctl calls %q, want %q", got, want)
	}
	b.assertNotExist(filepath.Join(b.home, "Library"))
}

// decodePlist reads an XML property list whose top level is a dict.
func decodePlist(data string) (map[string]any, error) {
	dec := xml.NewDecoder(strings.NewReader(data))
	dec.Strict = false
	for {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		if start, ok := tok.(xml.StartElement); ok && start.Name.Local == "dict" {
			v, err := plistValue(dec, start)
			if err != nil {
				return nil, err
			}
			return v.(map[string]any), nil
		}
	}
}

// plistValue reads the value that start opens, through its end element.
func plistValue(dec *xml.Decoder, start xml.StartElement) (any, error) {
	switch start.Name.Local {
	case "string", "integer", "key":
		var s string
		err := dec.DecodeElement(&s, &start)
		return s, err
	case "true", "false":
		return start.Name.Local == "true", dec.Skip()
	case "array", "dict":
		var items []any
		for {
			tok, err := dec.Token()
			if err == io.EOF {
				return nil, io.ErrUnexpectedEOF
			}
			if err != nil {
				return nil, err
			}
			switch tok := tok.(type) {
			case xml.StartElement:
				v, err := plistValue(dec, tok)
				if err != nil {
					return nil, err
				}
				items = append(items, v)
			case xml.EndElement:
				if start.Name.Local == "array" {
					return items, nil
				}
				if len(items)%2 != 0 {
					return nil, errors.New("dict: a key without a value")
				}
				m := map[string]any{}
				for i := 0; i < len(items); i += 2 {
					k, ok := items[i].(string)
					if !ok {
						return nil, errors.New("dict: a key that is not a string")
					}
					m[k] = items[i+1]
				}
				return m, nil
			}
		}
	}
	return nil, fmt.Errorf("unexpected element <%s>", start.Name.Local)
}
