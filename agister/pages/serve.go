// Package pages serves the Agister settings page on this machine: the
// page itself, embedded, and the JSON endpoints it calls: one asking the
// user to choose a folder in the Mac's own dialog, one returning a
// .agister folder's settings files, and three summarising the runs in
// Agister's home. It listens on the loopback address only and answers
// requests addressed to it by name, so no other site can read through it.
package pages

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed index.html repos.js config.js runs.js page.js
var assets embed.FS

// The .agister entries that hold settings; runs and logs are not settings.
var settingsEntries = map[string]bool{
	"agents": true, "policies": true, "processes": true, "runtimes": true,
	"schemas": true, "verifies": true, "prompts": true, "workflows": true,
	"service.toml": true,
}

// fileCap bounds each settings file sent to the page.
const fileCap = 256 << 10

// Home is the path the page names ~: Agister's home.
const Home = "~"

// Choose shows the user a folder dialog and returns the chosen folder's
// path, or "" when the user cancels.
type Choose func(ctx context.Context) (string, error)

// ChooseHeader must be on a request to /api/choose. A page on another site
// cannot send it without the server's consent, which it never gives, so
// only this page can pop the dialog.
const ChooseHeader = "X-Agister-Pages"

// Observe is the run store over the runs in runsDir, which tells whether
// an unfinished run is still owned.
type Observe func(runsDir string) RunObserver

// Handler serves the page and its endpoints. agisterHome is Agister's home
// (what ~ names); choose asks the user for a folder; observe reads the
// runs' owners.
func Handler(agisterHome string, choose Choose, observe Observe) http.Handler {
	mux := http.NewServeMux()
	var dialog sync.Mutex
	mux.Handle("GET /", http.FileServerFS(assets))
	mux.HandleFunc("POST /api/choose", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(ChooseHeader) == "" {
			reply(w, nil, statusError{http.StatusForbidden, "refused: " + ChooseHeader + " header missing"})
			return
		}
		// One dialog at a time: a second request while one is open is
		// refused rather than opening another window.
		if !dialog.TryLock() {
			reply(w, nil, statusError{http.StatusConflict, "a folder dialog is already open"})
			return
		}
		defer dialog.Unlock()
		path, err := choose(r.Context())
		if err == nil && path != "" {
			path = filepath.Clean(path)
		}
		reply(w, map[string]string{"path": path}, err)
	})
	mux.HandleFunc("GET /api/settings", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		dir := filepath.Join(path, ".agister")
		if path == Home {
			dir = agisterHome
		}
		files, err := settings(dir)
		// home: dir is Agister's home, asked as ~ or as the folder holding
		// it (the user's home), so the page shows it as ~.
		home := filepath.Clean(dir) == filepath.Clean(agisterHome)
		body := map[string]any{"path": path, "dir": dir, "home": home, "files": files}
		// A repo's settings go over Agister home's, so the page gets both:
		// homeFiles, empty when there is no home.
		if err == nil && !home {
			homeFiles, homeErr := settings(agisterHome)
			if homeErr != nil {
				homeFiles = map[string]string{}
			}
			body["homeFiles"] = homeFiles
		}
		reply(w, body, err)
	})
	runs := filepath.Join(agisterHome, "runs")
	owners := observe(runs)
	mux.HandleFunc("GET /api/runs", func(w http.ResponseWriter, r *http.Request) {
		limit := DefaultRunLimit
		if text := r.URL.Query().Get("limit"); text != "" {
			n, err := strconv.Atoi(text)
			if err != nil {
				reply(w, nil, badRequest("limit must be a positive number: "+text))
				return
			}
			limit = n
		}
		list, err := ListRuns(r.Context(), runs, owners, limit)
		reply(w, list, err)
	})
	mux.HandleFunc("GET /api/runs/compare", func(w http.ResponseWriter, r *http.Request) {
		comparison, err := Compare(runs)
		reply(w, comparison, err)
	})
	mux.HandleFunc("GET /api/runs/{id...}", func(w http.ResponseWriter, r *http.Request) {
		detail, err := ReadRun(r.Context(), runs, owners, r.PathValue("id"))
		reply(w, detail, err)
	})
	return loopbackOnly(mux)
}

// loopbackOnly refuses a request whose Host is not this machine by name or
// address: a page on another site that resolves its own name to 127.0.0.1
// (DNS rebinding) is refused.
func loopbackOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil {
			host = r.Host
		}
		if host != "localhost" && !isLoopbackIP(host) {
			http.Error(w, "refused: not addressed to this machine", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isLoopbackIP(host string) bool {
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && ip.IsLoopback()
}

// settings returns the settings files under dir, a .agister folder, by
// slash-separated path: at most fileCap bytes each, larger ones left out.
func settings(dir string) (map[string]string, error) {
	if !filepath.IsAbs(dir) {
		return nil, badRequest("path must be absolute or ~: " + dir)
	}
	if !isDir(dir) {
		return nil, notFound("no .agister folder at " + dir)
	}
	files := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, path)
		if rel == "." {
			return nil
		}
		if top, _, _ := strings.Cut(filepath.ToSlash(rel), "/"); !settingsEntries[top] {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || info.Size() > fileCap {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		files[filepath.ToSlash(rel)] = string(data)
		return nil
	})
	return files, err
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

type statusError struct {
	status  int
	message string
}

func (e statusError) Error() string { return e.message }

func badRequest(message string) error { return statusError{http.StatusBadRequest, message} }
func notFound(message string) error   { return statusError{http.StatusNotFound, message} }

func reply(w http.ResponseWriter, body any, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err != nil {
		status := http.StatusInternalServerError
		var se statusError
		switch {
		case errors.As(err, &se):
			status = se.status
		case errors.Is(err, fs.ErrNotExist):
			status = http.StatusNotFound
		case errors.Is(err, fs.ErrPermission):
			status = http.StatusForbidden
		}
		w.WriteHeader(status)
		body = map[string]string{"error": err.Error()}
	}
	_ = json.NewEncoder(w).Encode(body)
}

// Env is what Main needs from the process.
type Env struct {
	Stdout, Stderr io.Writer
	Getenv         func(string) string
	UserHome       func() (string, error)
	// Open shows url in the default browser; nil leaves it to the user.
	Open func(url string) error
	// Choose asks the user for a folder; nil answers every request with
	// an error.
	Choose Choose
	// Listen opens the server's socket; net.Listen when nil.
	Listen func(network, address string) (net.Listener, error)
	// Observe is the run store the runs' owners are read from.
	Observe Observe
}

// Usage is the help for agister pages.
const Usage = `Usage: agister pages [--addr <host:port>] [--home <dir>] [--no-open]

Serves the Agister settings page at http://<addr>/ until stopped (Ctrl-C) and
opens it in the default browser.
  --addr <host:port>  a loopback address (default 127.0.0.1:7465)
  --home <dir>        Agister's home, shown as ~ (default: $AGISTER_HOME, else ~/.agister)
  --no-open           do not open the browser`

// Main runs agister pages with args, the words after "pages", until ctx
// ends; it returns the exit code.
func Main(ctx context.Context, args []string, env Env) int {
	set := flag.NewFlagSet("agister pages", flag.ContinueOnError)
	set.SetOutput(io.Discard)
	addr := set.String("addr", "127.0.0.1:7465", "")
	home := set.String("home", "", "")
	noOpen := set.Bool("no-open", false, "")
	help := set.Bool("help", false, "")
	set.BoolVar(help, "h", false, "")
	if err := set.Parse(args); err != nil || set.NArg() > 0 {
		if err == nil {
			err = fmt.Errorf("unexpected argument %q", set.Arg(0))
		}
		fmt.Fprintf(env.Stderr, "agister pages: %v\n\n%s\n", err, Usage)
		return 64
	}
	if *help {
		fmt.Fprintln(env.Stdout, Usage)
		return 0
	}
	host, _, err := net.SplitHostPort(*addr)
	if err != nil || (host != "localhost" && !isLoopbackIP(host)) {
		fmt.Fprintf(env.Stderr, "agister pages: --addr must be a loopback address, got %q\n", *addr)
		return 64
	}
	userHome, err := env.UserHome()
	if err != nil {
		fmt.Fprintf(env.Stderr, "agister pages: %v\n", err)
		return 70
	}
	agisterHome := *home
	if agisterHome == "" {
		agisterHome = env.Getenv("AGISTER_HOME")
	}
	if agisterHome == "" {
		agisterHome = filepath.Join(userHome, ".agister")
	}
	if abs, err := filepath.Abs(agisterHome); err == nil {
		agisterHome = abs
	}

	if env.Observe == nil {
		fmt.Fprintln(env.Stderr, "agister pages: no run store to read the runs from")
		return 70
	}
	listen := env.Listen
	if listen == nil {
		listen = net.Listen
	}
	listener, err := listen("tcp", *addr)
	if err != nil {
		fmt.Fprintf(env.Stderr, "agister pages: %v\n", err)
		return 70
	}
	choose := env.Choose
	if choose == nil {
		choose = func(context.Context) (string, error) { return "", errors.New("no folder dialog on this system") }
	}
	server := &http.Server{Handler: Handler(agisterHome, choose, env.Observe), ReadHeaderTimeout: 10 * time.Second}
	url := "http://" + listener.Addr().String() + "/"
	fmt.Fprintf(env.Stdout, "Agister pages at %s (Ctrl-C stops)\n", url)
	if env.Open != nil && !*noOpen {
		if err := env.Open(url); err != nil {
			fmt.Fprintf(env.Stderr, "agister pages: could not open the browser: %v\n", err)
		}
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	select {
	case err := <-done:
		fmt.Fprintf(env.Stderr, "agister pages: %v\n", err)
		return 70
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
		return 0
	}
}

// Command runs name with args and returns its standard output and error.
type Command func(ctx context.Context, name string, args ...string) (stdout, stderr []byte, err error)

// MacDialog chooses a folder in the Mac's own folder dialog, run through
// osascript; cancelling it chooses nothing.
func MacDialog(run Command) Choose {
	return func(ctx context.Context) (string, error) {
		stdout, stderr, err := run(ctx, "osascript",
			"-e", "activate",
			"-e", `POSIX path of (choose folder with prompt "Choose a repo with Agister settings (.agister)")`)
		if err != nil {
			// osascript reports a cancelled dialog as error -128.
			if strings.Contains(string(stderr), "(-128)") {
				return "", nil
			}
			return "", fmt.Errorf("folder dialog: %v: %s", err, strings.TrimSpace(string(stderr)))
		}
		return strings.TrimSpace(string(stdout)), nil
	}
}
