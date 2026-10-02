package pages

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func write(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func mkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
}

// get sends a GET to h addressed to host and decodes a JSON body into out.
func get(t *testing.T, h http.Handler, host, target string, out any) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	req.Host = host
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if out != nil && strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("%s: %v: %s", target, err, rec.Body.String())
		}
	}
	return rec.Code
}

func q(path string) string { return url.QueryEscape(path) }

// noChoose fails the test when the dialog is asked for.
func noChoose(t *testing.T) Choose {
	return func(context.Context) (string, error) {
		t.Error("the folder dialog was shown")
		return "", nil
	}
}

// post sends a POST to h from this machine, with header when it is set.
func post(t *testing.T, h http.Handler, target, header string, out any) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, target, nil)
	req.Host = "127.0.0.1:7465"
	if header != "" {
		req.Header.Set(header, "1")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if out != nil {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("%s: %v: %s", target, err, rec.Body.String())
		}
	}
	return rec.Code
}

func TestChooseReturnsTheChosenFolder(t *testing.T) {
	h := Handler("/unused", func(context.Context) (string, error) { return "/Users/u/src/repo/", nil }, owners())
	var got map[string]string
	if code := post(t, h, "/api/choose", ChooseHeader, &got); code != 200 || got["path"] != "/Users/u/src/repo" {
		t.Errorf("%d %v", code, got)
	}
}

func TestChooseCancelledReturnsNoPath(t *testing.T) {
	h := Handler("/unused", func(context.Context) (string, error) { return "", nil }, owners())
	var got map[string]string
	if code := post(t, h, "/api/choose", ChooseHeader, &got); code != 200 || got["path"] != "" {
		t.Errorf("%d %v", code, got)
	}
}

func TestChooseFailureIsReported(t *testing.T) {
	h := Handler("/unused", func(context.Context) (string, error) { return "", errors.New("no dialog") }, owners())
	var got map[string]string
	if code := post(t, h, "/api/choose", ChooseHeader, &got); code != 500 || got["error"] != "no dialog" {
		t.Errorf("%d %v", code, got)
	}
}

func TestChooseOpensOneDialogAtATime(t *testing.T) {
	opened := make(chan struct{})
	release := make(chan struct{})
	shown := 0
	h := Handler("/unused", func(context.Context) (string, error) {
		shown++
		if shown == 1 {
			close(opened)
			<-release
		}
		return "/repo", nil
	}, owners())
	first := make(chan int, 1)
	go func() { first <- post(t, h, "/api/choose", ChooseHeader, nil) }()
	<-opened

	var got map[string]string
	if code := post(t, h, "/api/choose", ChooseHeader, &got); code != 409 || !strings.Contains(got["error"], "already open") {
		t.Errorf("while open: %d %v", code, got)
	}
	close(release)
	if code := <-first; code != 200 {
		t.Errorf("first: %d", code)
	}
	if code := post(t, h, "/api/choose", ChooseHeader, nil); code != 200 || shown != 2 {
		t.Errorf("after close: %d, dialogs shown %d", code, shown)
	}
}

func TestChooseNeedsThePagesHeaderAndPost(t *testing.T) {
	h := Handler("/unused", noChoose(t), owners())
	if code := post(t, h, "/api/choose", "", nil); code != 403 {
		t.Errorf("no header: %d", code)
	}
	if code := get(t, h, "127.0.0.1", "/api/choose", nil); code == 200 {
		t.Errorf("GET: %d", code)
	}
}

func TestMacDialogRunsOsascriptAndTrimsThePath(t *testing.T) {
	var name string
	var args []string
	choose := MacDialog(func(_ context.Context, n string, a ...string) ([]byte, []byte, error) {
		name, args = n, a
		return []byte("/Users/u/src/repo/\n"), nil, nil
	})
	path, err := choose(context.Background())
	if err != nil || path != "/Users/u/src/repo/" {
		t.Errorf("%q %v", path, err)
	}
	if name != "osascript" || !strings.Contains(strings.Join(args, " "), "choose folder") {
		t.Errorf("ran %s %v", name, args)
	}
}

func TestMacDialogCancelledChoosesNothing(t *testing.T) {
	choose := MacDialog(func(context.Context, string, ...string) ([]byte, []byte, error) {
		return nil, []byte("0:84: execution error: User canceled. (-128)\n"), errors.New("exit status 1")
	})
	if path, err := choose(context.Background()); path != "" || err != nil {
		t.Errorf("%q %v", path, err)
	}
}

func TestMacDialogFailureCarriesItsMessage(t *testing.T) {
	choose := MacDialog(func(context.Context, string, ...string) ([]byte, []byte, error) {
		return nil, []byte("not allowed\n"), errors.New("exit status 1")
	})
	if _, err := choose(context.Background()); err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Errorf("%v", err)
	}
}

func TestSettingsReturnsOnlySettingsFiles(t *testing.T) {
	repo := t.TempDir()
	dir := filepath.Join(repo, ".agister")
	write(t, filepath.Join(dir, "service.toml"), "max_attempts = 1")
	write(t, filepath.Join(dir, "agents", "a.toml"), `name = "a"`)
	write(t, filepath.Join(dir, "verifies", "repo.yaml"), "name: repo")
	write(t, filepath.Join(dir, "prompts", "review.md"), "Review it.")
	write(t, filepath.Join(dir, "processes", "nested", "p.yaml"), "name: p")
	write(t, filepath.Join(dir, "runs", "r1", "record.json"), "{}")
	write(t, filepath.Join(dir, "logs", "agister.jsonl"), "{}")
	write(t, filepath.Join(dir, "notes.md"), "x")
	write(t, filepath.Join(dir, "schemas", "big.json"), strings.Repeat("x", fileCap+1))

	var got struct {
		Path, Dir string
		Files     map[string]string
	}
	if code := get(t, Handler("/unused", noChoose(t), owners()), "127.0.0.1", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	want := map[string]string{
		"service.toml":            "max_attempts = 1",
		"agents/a.toml":           `name = "a"`,
		"verifies/repo.yaml":      "name: repo",
		"prompts/review.md":       "Review it.",
		"processes/nested/p.yaml": "name: p",
	}
	if !reflect.DeepEqual(got.Files, want) || got.Path != repo || got.Dir != dir {
		t.Errorf("got %+v", got)
	}
}

func TestSettingsOfTildeReadAgisterHome(t *testing.T) {
	home := t.TempDir()
	write(t, filepath.Join(home, "agents", "h.toml"), `name = "h"`)
	var got struct{ Files map[string]string }
	if code := get(t, Handler(home, noChoose(t), owners()), "127.0.0.1", "/api/settings?path=~", &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	if !reflect.DeepEqual(got.Files, map[string]string{"agents/h.toml": `name = "h"`}) {
		t.Errorf("got %v", got.Files)
	}
}

func TestSettingsOfARepoCarryAgisterHomes(t *testing.T) {
	user := t.TempDir()
	home := filepath.Join(user, ".agister")
	write(t, filepath.Join(home, "agents", "h.toml"), `name = "h"`)
	write(t, filepath.Join(home, "runs", "r", "record.json"), "{}")
	repo := filepath.Join(user, "repo")
	write(t, filepath.Join(repo, ".agister", "agents", "r.toml"), `name = "r"`)

	var got struct{ Files, HomeFiles map[string]string }
	if code := get(t, Handler(home, noChoose(t), owners()), "127.0.0.1", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	if !reflect.DeepEqual(got.Files, map[string]string{"agents/r.toml": `name = "r"`}) ||
		!reflect.DeepEqual(got.HomeFiles, map[string]string{"agents/h.toml": `name = "h"`}) {
		t.Errorf("got %+v", got)
	}

	var tilde map[string]any
	get(t, Handler(home, noChoose(t), owners()), "127.0.0.1", "/api/settings?path=~", &tilde)
	if _, ok := tilde["homeFiles"]; ok {
		t.Errorf("~ carries homeFiles: %v", tilde)
	}

	var noHome struct{ HomeFiles map[string]string }
	get(t, Handler(filepath.Join(user, "missing"), noChoose(t), owners()), "127.0.0.1", "/api/settings?path="+q(repo), &noHome)
	if noHome.HomeFiles == nil || len(noHome.HomeFiles) != 0 {
		t.Errorf("without a home: %v", noHome.HomeFiles)
	}
}

func TestSettingsMarkAgisterHomeHoweverAsked(t *testing.T) {
	user := t.TempDir()
	home := filepath.Join(user, ".agister")
	mkdir(t, home)
	repo := filepath.Join(user, "repo")
	mkdir(t, filepath.Join(repo, ".agister"))
	h := Handler(home, noChoose(t), owners())
	for path, want := range map[string]bool{"~": true, user: true, user + "/": true, repo: false} {
		var got struct{ Home bool }
		if code := get(t, h, "127.0.0.1", "/api/settings?path="+q(path), &got); code != 200 || got.Home != want {
			t.Errorf("%s: %d home=%v, want %v", path, code, got.Home, want)
		}
	}
}

func TestSettingsWithoutAgisterIsNotFound(t *testing.T) {
	h := Handler(filepath.Join(t.TempDir(), "missing"), noChoose(t), owners())
	var body map[string]string
	if code := get(t, h, "127.0.0.1", "/api/settings?path="+q(t.TempDir()), &body); code != 404 || !strings.Contains(body["error"], ".agister") {
		t.Errorf("repo: %d %v", code, body)
	}
	if code := get(t, h, "127.0.0.1", "/api/settings?path=~", &body); code != 404 {
		t.Errorf("home: %d %v", code, body)
	}
	if code := get(t, h, "127.0.0.1", "/api/settings?path=relative", &body); code != 400 {
		t.Errorf("relative: %d %v", code, body)
	}
}

func TestOnlyRequestsAddressedToThisMachineAreServed(t *testing.T) {
	h := Handler(t.TempDir(), noChoose(t), owners())
	for host, want := range map[string]int{
		"127.0.0.1:7465": 200, "localhost:7465": 200, "[::1]:7465": 200, "localhost": 200,
		"evil.example:7465": 403, "192.168.1.5:7465": 403, "localhost.evil.example": 403,
	} {
		if code := get(t, h, host, "/api/settings?path=~", nil); code != want {
			t.Errorf("Host %s: status %d, want %d", host, code, want)
		}
	}
}

func TestThePageIsServed(t *testing.T) {
	h := Handler("/unused", noChoose(t), owners())
	for _, path := range []string{"/", "/repos.js", "/config.js", "/runs.js", "/page.js"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Host = "127.0.0.1:7465"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != 200 || rec.Body.Len() == 0 {
			t.Errorf("%s: %d", path, rec.Code)
		}
	}
	req := httptest.NewRequest(http.MethodGet, "/serve.go", nil)
	req.Host = "127.0.0.1:7465"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 404 {
		t.Errorf("serve.go: %d, want 404", rec.Code)
	}
}

func env(stdout, stderr *bytes.Buffer) Env {
	return Env{
		Stdout:   stdout,
		Stderr:   stderr,
		Getenv:   func(string) string { return "" },
		UserHome: func() (string, error) { return "/home/u", nil },
		Listen:   func(string, string) (net.Listener, error) { return net.Listen("tcp", "127.0.0.1:0") },
		Observe:  owners(),
	}
}

func TestMainServesUntilCancelledAndOpensThePage(t *testing.T) {
	var stdout, stderr bytes.Buffer
	e := env(&stdout, &stderr)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	opened := make(chan string, 1)
	e.Open = func(u string) error { opened <- u; return nil }
	code := make(chan int, 1)
	go func() { code <- Main(ctx, nil, e) }()

	var u string
	select {
	case u = <-opened:
	case <-time.After(10 * time.Second):
		t.Fatal("the page was not opened")
	}
	resp, err := http.Get(u)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !strings.Contains(string(body), "<title>Agister</title>") {
		t.Errorf("GET %s: %d", u, resp.StatusCode)
	}
	cancel()
	select {
	case c := <-code:
		if c != 0 {
			t.Errorf("exit %d, stderr %s", c, stderr.String())
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Main did not stop when cancelled")
	}
	if !strings.Contains(stdout.String(), u) {
		t.Errorf("stdout %q does not name %s", stdout.String(), u)
	}
}

func TestMainWithNoOpenLeavesTheBrowserAlone(t *testing.T) {
	var stdout, stderr bytes.Buffer
	e := env(&stdout, &stderr)
	e.Open = func(string) error { t.Error("opened the browser"); return nil }
	listening := make(chan struct{})
	e.Listen = func(string, string) (net.Listener, error) {
		defer close(listening)
		return net.Listen("tcp", "127.0.0.1:0")
	}
	ctx, cancel := context.WithCancel(context.Background())
	code := make(chan int, 1)
	go func() { code <- Main(ctx, []string{"--no-open"}, e) }()
	<-listening
	cancel()
	if c := <-code; c != 0 {
		t.Errorf("exit %d", c)
	}
}

func TestMainRefusesBadArguments(t *testing.T) {
	for _, args := range [][]string{
		{"--addr", "0.0.0.0:7465"},
		{"--addr", "example.com:80"},
		{"--addr", "no-port"},
		{"extra"},
		{"--unknown"},
	} {
		var stdout, stderr bytes.Buffer
		e := env(&stdout, &stderr)
		e.Listen = func(string, string) (net.Listener, error) {
			t.Errorf("%v: listened", args)
			return nil, errors.New("no")
		}
		if c := Main(context.Background(), args, e); c != 64 || stderr.Len() == 0 {
			t.Errorf("%v: exit %d, stderr %q", args, c, stderr.String())
		}
	}
}

func TestMainHelp(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if c := Main(context.Background(), []string{"--help"}, env(&stdout, &stderr)); c != 0 || !strings.Contains(stdout.String(), "--no-open") {
		t.Errorf("exit %d, stdout %q", c, stdout.String())
	}
}

func TestMainReportsAPortInUse(t *testing.T) {
	var stdout, stderr bytes.Buffer
	e := env(&stdout, &stderr)
	e.Listen = func(string, string) (net.Listener, error) { return nil, errors.New("address already in use") }
	if c := Main(context.Background(), nil, e); c != 70 || !strings.Contains(stderr.String(), "in use") {
		t.Errorf("exit %d, stderr %q", c, stderr.String())
	}
}

func TestMainNeedsARunStore(t *testing.T) {
	var stdout, stderr bytes.Buffer
	e := env(&stdout, &stderr)
	e.Observe = nil
	e.Listen = func(string, string) (net.Listener, error) {
		t.Error("listened with no run store")
		return nil, errors.New("unused")
	}
	if c := Main(context.Background(), nil, e); c != 70 || !strings.Contains(stderr.String(), "run store") {
		t.Errorf("exit %d, stderr %q", c, stderr.String())
	}
}
