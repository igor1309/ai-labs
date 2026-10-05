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
	"sync"
	"testing"
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
	t.Parallel()
	h := Handler("/unused", func(context.Context) (string, error) { return "/Users/u/src/repo/", nil }, owners(), SkillHomes{})
	var got map[string]string
	if code := post(t, h, "/api/choose", ChooseHeader, &got); code != 200 || got["path"] != "/Users/u/src/repo" {
		t.Errorf("%d %v", code, got)
	}
}

func TestChooseCancelledReturnsNoPath(t *testing.T) {
	t.Parallel()
	h := Handler("/unused", func(context.Context) (string, error) { return "", nil }, owners(), SkillHomes{})
	var got map[string]string
	if code := post(t, h, "/api/choose", ChooseHeader, &got); code != 200 || got["path"] != "" {
		t.Errorf("%d %v", code, got)
	}
}

func TestChooseFailureIsReported(t *testing.T) {
	t.Parallel()
	h := Handler("/unused", func(context.Context) (string, error) { return "", errors.New("no dialog") }, owners(), SkillHomes{})
	var got map[string]string
	if code := post(t, h, "/api/choose", ChooseHeader, &got); code != 500 || got["error"] != "no dialog" {
		t.Errorf("%d %v", code, got)
	}
}

func TestChooseOpensOneDialogAtATime(t *testing.T) {
	t.Parallel()
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
	}, owners(), SkillHomes{})
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
	t.Parallel()
	h := Handler("/unused", noChoose(t), owners(), SkillHomes{})
	if code := post(t, h, "/api/choose", "", nil); code != 403 {
		t.Errorf("no header: %d", code)
	}
	if code := get(t, h, "127.0.0.1", "/api/choose", nil); code == 200 {
		t.Errorf("GET: %d", code)
	}
}

func TestMacDialogRunsOsascriptAndTrimsThePath(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	choose := MacDialog(func(context.Context, string, ...string) ([]byte, []byte, error) {
		return nil, []byte("0:84: execution error: User canceled. (-128)\n"), errors.New("exit status 1")
	})
	if path, err := choose(context.Background()); path != "" || err != nil {
		t.Errorf("%q %v", path, err)
	}
}

func TestMacDialogFailureCarriesItsMessage(t *testing.T) {
	t.Parallel()
	choose := MacDialog(func(context.Context, string, ...string) ([]byte, []byte, error) {
		return nil, []byte("not allowed\n"), errors.New("exit status 1")
	})
	if _, err := choose(context.Background()); err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Errorf("%v", err)
	}
}

func TestSettingsReturnsOnlySettingsFiles(t *testing.T) {
	t.Parallel()
	repo := t.TempDir()
	dir := filepath.Join(repo, ".agister")
	write(t, filepath.Join(dir, "service.toml"), "max_attempts = 1")
	write(t, filepath.Join(dir, "workspace.yaml"), "setup: {}")
	write(t, filepath.Join(dir, "agents", "a.toml"), `name = "a"`)
	write(t, filepath.Join(dir, "verifies", "repo.yaml"), "name: repo")
	write(t, filepath.Join(dir, "prompts", "review.md"), "Review it.")
	// Skills are not settings files here: /api/skills reads them (D-16).
	write(t, filepath.Join(dir, "skills", "plan", "SKILL.md"), skillMD("plan", "P."))
	write(t, filepath.Join(dir, "skills", "plan", "notes.txt"), "beside")
	write(t, filepath.Join(dir, "skills", "big", "SKILL.md"), strings.Repeat("x", fileCap+1))
	write(t, filepath.Join(dir, "processes", "nested", "p.yaml"), "name: p")
	write(t, filepath.Join(dir, "runs", "r1", "record.json"), "{}")
	write(t, filepath.Join(dir, "logs", "agister.jsonl"), "{}")
	write(t, filepath.Join(dir, "notes.md"), "x")
	write(t, filepath.Join(dir, "schemas", "big.json"), strings.Repeat("x", fileCap+1))

	var got struct {
		Path, Dir string
		Files     map[string]string
	}
	if code := get(t, Handler("/unused", noChoose(t), owners(), SkillHomes{}), "127.0.0.1", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	want := map[string]string{
		"service.toml":            "max_attempts = 1",
		"workspace.yaml":          "setup: {}",
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
	t.Parallel()
	home := t.TempDir()
	write(t, filepath.Join(home, "agents", "h.toml"), `name = "h"`)
	var got struct{ Files map[string]string }
	if code := get(t, Handler(home, noChoose(t), owners(), SkillHomes{}), "127.0.0.1", "/api/settings?path=~", &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	if !reflect.DeepEqual(got.Files, map[string]string{"agents/h.toml": `name = "h"`}) {
		t.Errorf("got %v", got.Files)
	}
}

func TestSettingsOfARepoCarryAgisterHomes(t *testing.T) {
	t.Parallel()
	user := t.TempDir()
	home := filepath.Join(user, ".agister")
	write(t, filepath.Join(home, "agents", "h.toml"), `name = "h"`)
	write(t, filepath.Join(home, "runs", "r", "record.json"), "{}")
	repo := filepath.Join(user, "repo")
	write(t, filepath.Join(repo, ".agister", "agents", "r.toml"), `name = "r"`)

	var got struct{ Files, HomeFiles map[string]string }
	if code := get(t, Handler(home, noChoose(t), owners(), SkillHomes{}), "127.0.0.1", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	if !reflect.DeepEqual(got.Files, map[string]string{"agents/r.toml": `name = "r"`}) ||
		!reflect.DeepEqual(got.HomeFiles, map[string]string{"agents/h.toml": `name = "h"`}) {
		t.Errorf("got %+v", got)
	}

	var tilde map[string]any
	get(t, Handler(home, noChoose(t), owners(), SkillHomes{}), "127.0.0.1", "/api/settings?path=~", &tilde)
	if _, ok := tilde["homeFiles"]; ok {
		t.Errorf("~ carries homeFiles: %v", tilde)
	}

	var noHome struct{ HomeFiles map[string]string }
	get(t, Handler(filepath.Join(user, "missing"), noChoose(t), owners(), SkillHomes{}), "127.0.0.1", "/api/settings?path="+q(repo), &noHome)
	if noHome.HomeFiles == nil || len(noHome.HomeFiles) != 0 {
		t.Errorf("without a home: %v", noHome.HomeFiles)
	}
}

func TestSettingsMarkAgisterHomeHoweverAsked(t *testing.T) {
	t.Parallel()
	user := t.TempDir()
	home := filepath.Join(user, ".agister")
	mkdir(t, home)
	repo := filepath.Join(user, "repo")
	mkdir(t, filepath.Join(repo, ".agister"))
	h := Handler(home, noChoose(t), owners(), SkillHomes{})
	for path, want := range map[string]bool{"~": true, user: true, user + "/": true, repo: false} {
		var got struct{ Home bool }
		if code := get(t, h, "127.0.0.1", "/api/settings?path="+q(path), &got); code != 200 || got.Home != want {
			t.Errorf("%s: %d home=%v, want %v", path, code, got.Home, want)
		}
	}
}

func TestSettingsWithoutAgisterIsNotFound(t *testing.T) {
	t.Parallel()
	h := Handler(filepath.Join(t.TempDir(), "missing"), noChoose(t), owners(), SkillHomes{})
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
	t.Parallel()
	h := Handler(t.TempDir(), noChoose(t), owners(), SkillHomes{})
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
	t.Parallel()
	h := Handler("/unused", noChoose(t), owners(), SkillHomes{})
	for _, path := range []string{"/", "/repos.js", "/config.js", "/runs.js", "/markdown-it.min.js", "/knowledge.js", "/page.js"} {
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

// memoryListener is a listener with no socket: a connection is an
// in-memory pipe, handed from dial to Accept.
type memoryListener struct {
	conns  chan net.Conn
	closed chan struct{}
	once   sync.Once
}

type memoryAddr string

func (memoryAddr) Network() string  { return "memory" }
func (a memoryAddr) String() string { return string(a) }

func newMemoryListener() *memoryListener {
	return &memoryListener{conns: make(chan net.Conn), closed: make(chan struct{})}
}

func (l *memoryListener) Accept() (net.Conn, error) {
	select {
	case conn := <-l.conns:
		return conn, nil
	case <-l.closed:
		return nil, net.ErrClosed
	}
}

func (l *memoryListener) Close() error {
	l.once.Do(func() { close(l.closed) })
	return nil
}

// Addr is an address the handler's Host check lets through.
func (l *memoryListener) Addr() net.Addr { return memoryAddr("127.0.0.1:7465") }

// dial connects to the listener, whatever address is asked for; it returns
// once the server has accepted the connection.
func (l *memoryListener) dial(context.Context, string, string) (net.Conn, error) {
	client, server := net.Pipe()
	select {
	case l.conns <- server:
		return client, nil
	case <-l.closed:
		return nil, net.ErrClosed
	}
}

// env is an environment whose Listen hands out the in-memory listener it
// returns.
func env(stdout, stderr *bytes.Buffer) (Env, *memoryListener) {
	listener := newMemoryListener()
	return Env{
		Stdout:   stdout,
		Stderr:   stderr,
		Getenv:   func(string) string { return "" },
		UserHome: func() (string, error) { return "/home/u", nil },
		Listen:   func(string, string) (net.Listener, error) { return listener, nil },
		Observe:  owners(),
	}, listener
}

func TestMainServesUntilCancelledAndOpensThePage(t *testing.T) {
	t.Parallel()
	var stdout, stderr bytes.Buffer
	e, listener := env(&stdout, &stderr)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	opened := make(chan string, 1)
	e.Open = func(u string) error { opened <- u; return nil }
	code := make(chan int, 1)
	go func() { code <- Main(ctx, nil, e) }()

	u := <-opened
	client := &http.Client{Transport: &http.Transport{DialContext: listener.dial}}
	resp, err := client.Get(u)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !strings.Contains(string(body), "<title>Agister</title>") {
		t.Errorf("GET %s: %d", u, resp.StatusCode)
	}
	client.CloseIdleConnections()
	cancel()
	if c := <-code; c != 0 {
		t.Errorf("exit %d, stderr %s", c, stderr.String())
	}
	if !strings.Contains(stdout.String(), u) {
		t.Errorf("stdout %q does not name %s", stdout.String(), u)
	}
}

func TestMainWithNoOpenLeavesTheBrowserAlone(t *testing.T) {
	t.Parallel()
	var stdout, stderr bytes.Buffer
	e, listener := env(&stdout, &stderr)
	e.Open = func(string) error { t.Error("opened the browser"); return nil }
	listening := make(chan struct{})
	e.Listen = func(string, string) (net.Listener, error) {
		defer close(listening)
		return listener, nil
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
	t.Parallel()
	for _, args := range [][]string{
		{"--addr", "0.0.0.0:7465"},
		{"--addr", "example.com:80"},
		{"--addr", "no-port"},
		{"extra"},
		{"--unknown"},
	} {
		var stdout, stderr bytes.Buffer
		e, _ := env(&stdout, &stderr)
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
	t.Parallel()
	var stdout, stderr bytes.Buffer
	e, _ := env(&stdout, &stderr)
	if c := Main(context.Background(), []string{"--help"}, e); c != 0 || !strings.Contains(stdout.String(), "--no-open") {
		t.Errorf("exit %d, stdout %q", c, stdout.String())
	}
}

func TestMainReportsAPortInUse(t *testing.T) {
	t.Parallel()
	var stdout, stderr bytes.Buffer
	e, _ := env(&stdout, &stderr)
	e.Listen = func(string, string) (net.Listener, error) { return nil, errors.New("address already in use") }
	if c := Main(context.Background(), nil, e); c != 70 || !strings.Contains(stderr.String(), "in use") {
		t.Errorf("exit %d, stderr %q", c, stderr.String())
	}
}

func TestMainNeedsARunStore(t *testing.T) {
	t.Parallel()
	var stdout, stderr bytes.Buffer
	e, _ := env(&stdout, &stderr)
	e.Observe = nil
	e.Listen = func(string, string) (net.Listener, error) {
		t.Error("listened with no run store")
		return nil, errors.New("unused")
	}
	if c := Main(context.Background(), nil, e); c != 70 || !strings.Contains(stderr.String(), "run store") {
		t.Errorf("exit %d, stderr %q", c, stderr.String())
	}
}

// unreadable writes a file at path that cannot be read.
func unreadable(t *testing.T, path string) {
	t.Helper()
	write(t, path, "locked")
	if err := os.Chmod(path, 0); err != nil {
		t.Fatal(err)
	}
}

// D-16, ADR-011 rule 9: /api/settings reads no file of either layer's
// skills/, so one that cannot be read does not fail it; the skills come
// from /api/skills, which reads each skill's SKILL.md alone.
func TestSettingsEndpointDoesNotReadSkillFiles(t *testing.T) {
	t.Parallel()
	user := t.TempDir()
	home := filepath.Join(user, ".agister")
	write(t, filepath.Join(home, "agents", "h.toml"), `name = "h"`)
	write(t, filepath.Join(home, "skills", "go", "SKILL.md"), skillMD("go", "Go."))
	write(t, filepath.Join(home, "skills", "go", "notes.txt"), "beside")
	repo := filepath.Join(user, "repo")
	dir := filepath.Join(repo, ".agister")
	write(t, filepath.Join(dir, "agents", "r.toml"), `name = "r"`)
	write(t, filepath.Join(dir, "skills", "plan", "SKILL.md"), skillMD("plan", "Plan."))
	unreadable(t, filepath.Join(dir, "skills", "plan", "locked.txt"))

	var reads []string
	read := func(path string) ([]byte, error) {
		reads = append(reads, path)
		return os.ReadFile(path)
	}
	h := handler(home, noChoose(t), owners(), SkillHomes{}, read)
	var got struct{ Files, HomeFiles map[string]string }
	if code := get(t, h, "127.0.0.1", "/api/settings?path="+q(repo), &got); code != 200 {
		t.Fatalf("status %d", code)
	}
	if !reflect.DeepEqual(got.Files, map[string]string{"agents/r.toml": `name = "r"`}) ||
		!reflect.DeepEqual(got.HomeFiles, map[string]string{"agents/h.toml": `name = "h"`}) {
		t.Errorf("got %+v", got)
	}
	inSkills := func() []string {
		var out []string
		for _, path := range reads {
			if strings.Contains(path, string(filepath.Separator)+"skills"+string(filepath.Separator)) {
				out = append(out, path)
			}
		}
		return out
	}
	if r := inSkills(); r != nil {
		t.Errorf("/api/settings read %q", r)
	}

	reads = nil
	var skills SkillsReply
	if code := get(t, h, "127.0.0.1", "/api/skills?path="+q(repo), &skills); code != 200 {
		t.Fatalf("skills: status %d", code)
	}
	if want := []string{filepath.Join(dir, "skills", "plan", "SKILL.md"), filepath.Join(home, "skills", "go", "SKILL.md")}; !reflect.DeepEqual(inSkills(), want) {
		t.Errorf("/api/skills read %q, want %q", inSkills(), want)
	}
	if len(skills.Settings) != 2 || skills.Settings[0].Name != "plan" || skills.Settings[0].Checks.Passed {
		t.Errorf("settings skills: %+v", skills.Settings)
	}
}
