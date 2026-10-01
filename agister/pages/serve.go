// Package pages serves the Agister settings page on this machine: the
// page itself, embedded, and two read-only JSON endpoints it calls, one
// listing a folder's subfolders and one returning a .agister folder's
// settings files. It listens on the loopback address only and answers
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
	"sort"
	"strings"
	"time"
)

//go:embed index.html repos.js config.js
var assets embed.FS

// The .agister entries that hold settings; runs and logs are not settings.
var settingsEntries = map[string]bool{
	"agents": true, "policies": true, "processes": true, "runtimes": true,
	"schemas": true, "workflows": true, "service.toml": true,
}

// fileCap bounds each settings file sent to the page.
const fileCap = 256 << 10

// Home is the path the page names ~: Agister's home.
const Home = "~"

// Handler serves the page and its endpoints. agisterHome is Agister's home
// (what ~ names); userHome is where browsing starts.
func Handler(agisterHome, userHome string) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /", http.FileServerFS(assets))
	mux.HandleFunc("GET /api/folders", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			path = userHome
		}
		listing, err := folders(path)
		reply(w, listing, err)
	})
	mux.HandleFunc("GET /api/settings", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		dir := filepath.Join(path, ".agister")
		if path == Home {
			dir = agisterHome
		}
		files, err := settings(dir)
		reply(w, map[string]any{"path": path, "dir": dir, "files": files}, err)
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

// Folder is one subfolder in a listing.
type Folder struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Agister bool   `json:"agister"` // it holds a .agister folder
}

// Listing is a folder's subfolders, by name; hidden ones are left out.
type Listing struct {
	Path    string   `json:"path"`
	Parent  string   `json:"parent,omitempty"` // empty at the root
	Agister bool     `json:"agister"`
	Folders []Folder `json:"folders"`
}

func folders(path string) (Listing, error) {
	if !filepath.IsAbs(path) {
		return Listing{}, badRequest("path must be absolute: " + path)
	}
	path = filepath.Clean(path)
	entries, err := os.ReadDir(path)
	if err != nil {
		return Listing{}, err
	}
	listing := Listing{Path: path, Agister: isDir(filepath.Join(path, ".agister")), Folders: []Folder{}}
	if parent := filepath.Dir(path); parent != path {
		listing.Parent = parent
	}
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		full := filepath.Join(path, name)
		// A symlink to a folder counts as a folder.
		if !entry.IsDir() && !(entry.Type()&fs.ModeSymlink != 0 && isDir(full)) {
			continue
		}
		listing.Folders = append(listing.Folders, Folder{Name: name, Path: full, Agister: isDir(filepath.Join(full, ".agister"))})
	}
	sort.Slice(listing.Folders, func(i, j int) bool {
		return strings.ToLower(listing.Folders[i].Name) < strings.ToLower(listing.Folders[j].Name)
	})
	return listing, nil
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
	// Listen opens the server's socket; net.Listen when nil.
	Listen func(network, address string) (net.Listener, error)
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

	listen := env.Listen
	if listen == nil {
		listen = net.Listen
	}
	listener, err := listen("tcp", *addr)
	if err != nil {
		fmt.Fprintf(env.Stderr, "agister pages: %v\n", err)
		return 70
	}
	server := &http.Server{Handler: Handler(agisterHome, userHome), ReadHeaderTimeout: 10 * time.Second}
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
