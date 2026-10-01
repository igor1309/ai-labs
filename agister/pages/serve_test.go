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

func TestFoldersListsSubfoldersAndMarksAgisterRepos(t *testing.T) {
	root := t.TempDir()
	mkdir(t, filepath.Join(root, "beta", ".agister"))
	mkdir(t, filepath.Join(root, "Alpha"))
	mkdir(t, filepath.Join(root, ".hidden"))
	write(t, filepath.Join(root, "file.txt"), "x")
	write(t, filepath.Join(root, "gamma", ".agister"), "a file, not a folder")
	if err := os.Symlink(filepath.Join(root, "beta"), filepath.Join(root, "link")); err != nil {
		t.Fatal(err)
	}
	mkdir(t, filepath.Join(root, ".agister"))

	var got Listing
	if code := get(t, Handler("/unused", root), "127.0.0.1:7465", "/api/folders?path="+q(root), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	want := Listing{Path: root, Parent: filepath.Dir(root), Agister: true, Folders: []Folder{
		{Name: "Alpha", Path: filepath.Join(root, "Alpha")},
		{Name: "beta", Path: filepath.Join(root, "beta"), Agister: true},
		{Name: "gamma", Path: filepath.Join(root, "gamma")},
		{Name: "link", Path: filepath.Join(root, "link"), Agister: true},
	}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v\nwant %+v", got, want)
	}
}

func TestFoldersStartsAtTheUserHome(t *testing.T) {
	home := t.TempDir()
	mkdir(t, filepath.Join(home, "repo"))
	var got Listing
	get(t, Handler("/unused", home), "localhost:7465", "/api/folders", &got)
	if got.Path != home || len(got.Folders) != 1 {
		t.Errorf("got %+v", got)
	}
}

func TestFoldersRefusesRelativeAndMissingPaths(t *testing.T) {
	h := Handler("/unused", t.TempDir())
	var body map[string]string
	if code := get(t, h, "127.0.0.1", "/api/folders?path=relative", &body); code != 400 || body["error"] == "" {
		t.Errorf("relative: %d %v", code, body)
	}
	if code := get(t, h, "127.0.0.1", "/api/folders?path="+q(filepath.Join(t.TempDir(), "missing")), &body); code != 404 {
		t.Errorf("missing: %d %v", code, body)
	}
}

func TestSettingsReturnsOnlySettingsFiles(t *testing.T) {
	repo := t.TempDir()
	dir := filepath.Join(repo, ".agister")
	write(t, filepath.Join(dir, "service.toml"), "max_attempts = 1")
	write(t, filepath.Join(dir, "agents", "a.toml"), `name = "a"`)
	write(t, filepath.Join(dir, "processes", "nested", "p.yaml"), "name: p")
	write(t, filepath.Join(dir, "runs", "r1", "record.json"), "{}")
	write(t, filepath.Join(dir, "logs", "agister.jsonl"), "{}")
	write(t, filepath.Join(dir, "notes.md"), "x")
	write(t, filepath.Join(dir, "schemas", "big.json"), strings.Repeat("x", fileCap+1))

	var got struct {
		Path, Dir string
		Files     map[string]string
	}
	if code := get(t, Handler("/unused", "/unused"), "127.0.0.1", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	want := map[string]string{
		"service.toml":            "max_attempts = 1",
		"agents/a.toml":           `name = "a"`,
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
	if code := get(t, Handler(home, "/unused"), "127.0.0.1", "/api/settings?path=~", &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	if !reflect.DeepEqual(got.Files, map[string]string{"agents/h.toml": `name = "h"`}) {
		t.Errorf("got %v", got.Files)
	}
}

func TestSettingsWithoutAgisterIsNotFound(t *testing.T) {
	h := Handler(filepath.Join(t.TempDir(), "missing"), "/unused")
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
	h := Handler(t.TempDir(), t.TempDir())
	for host, want := range map[string]int{
		"127.0.0.1:7465": 200, "localhost:7465": 200, "[::1]:7465": 200, "localhost": 200,
		"evil.example:7465": 403, "192.168.1.5:7465": 403, "localhost.evil.example": 403,
	} {
		if code := get(t, h, host, "/api/folders", nil); code != want {
			t.Errorf("Host %s: status %d, want %d", host, code, want)
		}
	}
}

func TestThePageIsServed(t *testing.T) {
	h := Handler("/unused", "/unused")
	for _, path := range []string{"/", "/repos.js", "/config.js"} {
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
