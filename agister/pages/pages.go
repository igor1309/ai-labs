// Package pages serves a read-only local page of the runs kept (ADR-015).
// It reads them through the Runs port, which the composition answers.
package pages

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ErrNotFound is the error of a run not kept.
var ErrNotFound = errors.New("pages: no such run")

// Limits of a run list.
const (
	DefaultLimit = 200
	MaxLimit     = 1000
)

// Runs is the port of the runs kept: every run's id, and one run.
type Runs interface {
	IDs() ([]string, error)
	Run(id string) (Run, error)
}

// Run is one run as pages shows it. Status is the state agister status
// gives; DurationMS and Cost are nil where unknown.
type Run struct {
	ID         string            `json:"id"`
	Workflow   string            `json:"workflow,omitempty"`
	Process    string            `json:"process,omitempty"`
	Agent      string            `json:"agent,omitempty"`
	Started    time.Time         `json:"started"`
	Ended      *time.Time        `json:"ended,omitempty"`
	Status     string            `json:"status"`
	Class      string            `json:"class,omitempty"`
	Reason     string            `json:"reason,omitempty"`
	DurationMS *int64            `json:"duration_ms,omitempty"`
	Cost       *float64          `json:"cost,omitempty"`
	Params     map[string]string `json:"params,omitempty"`
	Dir        string            `json:"dir,omitempty"`
	Output     any               `json:"output,omitempty"`
	Calls      []Call            `json:"calls"`
	Children   []Child           `json:"children"`
}

// Call is one call of a run as it ended.
type Call struct {
	Step       string   `json:"step"`
	Process    string   `json:"process"`
	Agent      string   `json:"agent"`
	Status     string   `json:"status"`
	Class      string   `json:"class,omitempty"`
	DurationMS int64    `json:"duration_ms"`
	Cost       *float64 `json:"cost,omitempty"`
}

// Child is a workflow run inside its parent run.
type Child struct {
	ID       string `json:"id"`
	Workflow string `json:"workflow"`
	Status   string `json:"status"`
	Class    string `json:"class,omitempty"`
}

// Row is a run in the list: the run without its calls' detail.
type Row struct {
	ID         string     `json:"id"`
	Workflow   string     `json:"workflow,omitempty"`
	Process    string     `json:"process,omitempty"`
	Agent      string     `json:"agent,omitempty"`
	Started    time.Time  `json:"started"`
	Ended      *time.Time `json:"ended,omitempty"`
	Status     string     `json:"status"`
	Class      string     `json:"class,omitempty"`
	Reason     string     `json:"reason,omitempty"`
	DurationMS *int64     `json:"duration_ms,omitempty"`
	Cost       *float64   `json:"cost,omitempty"`
	Calls      int        `json:"calls"`
}

// List is the newest runs, at most a limit, of Total kept; Skipped counts
// the runs met while reading that could not be read.
type List struct {
	Runs    []Row `json:"runs"`
	Total   int   `json:"total"`
	Skipped int   `json:"skipped"`
}

// Group is the calls of one process on one agent that ended completed or
// failed.
type Group struct {
	Process     string  `json:"process"`
	Agent       string  `json:"agent"`
	Runs        int     `json:"runs"`
	Completed   int     `json:"completed"`
	PassRate    float64 `json:"pass_rate"`
	MedianMS    float64 `json:"median_ms"`
	TotalCost   float64 `json:"total_cost"`
	CostUnknown int     `json:"cost_unknown"`
}

// Comparison is every group, by process then agent.
type Comparison struct {
	Groups  []Group `json:"groups"`
	Skipped int     `json:"skipped"`
}

//go:embed static
var static embed.FS

// Handler serves the page and its read endpoints over runs, loopback only.
func Handler(runs Runs) http.Handler {
	mux := http.NewServeMux()
	assets, _ := fs.Sub(static, "static")
	mux.Handle("GET /", http.FileServerFS(assets))
	mux.HandleFunc("GET /api/runs", func(w http.ResponseWriter, r *http.Request) {
		limit := DefaultLimit
		if text := r.URL.Query().Get("limit"); text != "" {
			n, err := strconv.Atoi(text)
			if err != nil || n < 1 {
				http.Error(w, "limit must be a positive number: "+text, http.StatusBadRequest)
				return
			}
			limit = min(n, MaxLimit)
		}
		list, err := ListRuns(runs, limit)
		reply(w, list, err)
	})
	mux.HandleFunc("GET /api/runs/compare", func(w http.ResponseWriter, r *http.Request) {
		comparison, err := Compare(runs)
		reply(w, comparison, err)
	})
	mux.HandleFunc("GET /api/runs/{id}", func(w http.ResponseWriter, r *http.Request) {
		run, err := runs.Run(r.PathValue("id"))
		reply(w, run, err)
	})
	return loopbackOnly(mux)
}

// newestFirst is ids sorted newest first: an id begins with its UTC start.
func newestFirst(runs Runs) ([]string, error) {
	ids, err := runs.IDs()
	if err != nil {
		return nil, err
	}
	ids = slices.Clone(ids)
	sort.Sort(sort.Reverse(sort.StringSlice(ids)))
	return ids, nil
}

// ListRuns reads the newest runs until limit are read.
func ListRuns(runs Runs, limit int) (List, error) {
	ids, err := newestFirst(runs)
	if err != nil {
		return List{}, err
	}
	list := List{Runs: []Row{}, Total: len(ids)}
	for _, id := range ids {
		if len(list.Runs) == limit {
			break
		}
		run, err := runs.Run(id)
		if err != nil {
			list.Skipped++
			continue
		}
		list.Runs = append(list.Runs, row(run))
	}
	return list, nil
}

func row(r Run) Row {
	return Row{ID: r.ID, Workflow: r.Workflow, Process: r.Process, Agent: r.Agent, Started: r.Started, Ended: r.Ended,
		Status: r.Status, Class: r.Class, Reason: r.Reason, DurationMS: r.DurationMS, Cost: r.Cost, Calls: len(r.Calls)}
}

// Compare tallies every call that itself ended completed or failed,
// whatever its run's status, by process and agent.
func Compare(runs Runs) (Comparison, error) {
	ids, err := newestFirst(runs)
	if err != nil {
		return Comparison{}, err
	}
	type key struct{ process, agent string }
	type tally struct {
		group     Group
		durations []int64
	}
	groups := map[key]*tally{}
	comparison := Comparison{Groups: []Group{}}
	for _, id := range ids {
		run, err := runs.Run(id)
		if err != nil {
			comparison.Skipped++
			continue
		}
		for _, call := range run.Calls {
			if call.Status != "completed" && call.Status != "failed" {
				continue
			}
			k := key{call.Process, call.Agent}
			t := groups[k]
			if t == nil {
				t = &tally{group: Group{Process: k.process, Agent: k.agent}}
				groups[k] = t
			}
			t.group.Runs++
			if call.Status == "completed" {
				t.group.Completed++
			}
			t.durations = append(t.durations, call.DurationMS)
			if call.Cost != nil {
				t.group.TotalCost += *call.Cost
			} else {
				t.group.CostUnknown++
			}
		}
	}
	for _, t := range groups {
		g := t.group
		g.PassRate = float64(g.Completed) / float64(g.Runs)
		g.MedianMS = median(t.durations)
		comparison.Groups = append(comparison.Groups, g)
	}
	slices.SortFunc(comparison.Groups, func(a, b Group) int {
		if c := strings.Compare(a.Process, b.Process); c != 0 {
			return c
		}
		return strings.Compare(a.Agent, b.Agent)
	})
	return comparison, nil
}

func median(values []int64) float64 {
	slices.Sort(values)
	n := len(values)
	if n%2 == 1 {
		return float64(values[n/2])
	}
	return float64(values[n/2-1]+values[n/2]) / 2
}

func reply(w http.ResponseWriter, value any, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case err != nil:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	default:
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(value)
	}
}

// loopbackOnly refuses a request whose Host is not this machine, so a
// page elsewhere whose name resolves to 127.0.0.1 is refused.
func loopbackOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil {
			host = r.Host
		}
		ip := net.ParseIP(strings.Trim(host, "[]"))
		if host != "localhost" && (ip == nil || !ip.IsLoopback()) {
			http.Error(w, "refused: not addressed to this machine", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Usage is the help for agister pages.
const Usage = `usage: agister pages [--addr <host:port>] [--no-open]

Serves the page of the runs kept at http://<addr>/ (default 127.0.0.1:7465)
until stopped, and opens it in the browser unless --no-open.`

// Env is what Main is given, each required: its output, its socket, the
// browser and the runs.
type Env struct {
	Stdout, Stderr io.Writer
	Listen         func(network, address string) (net.Listener, error)
	// Open shows url in the browser.
	Open func(url string) error
	Runs Runs
}

// Main runs agister pages with args, the words after "pages", until ctx
// ends, and gives its exit code: 0 stopped, 1 failed, 64 usage.
func Main(ctx context.Context, args []string, env Env) int {
	if env.Stdout == nil || env.Stderr == nil || env.Listen == nil || env.Open == nil || env.Runs == nil {
		if env.Stderr != nil {
			fmt.Fprintln(env.Stderr, "agister pages: missing collaborator")
		}
		return 1
	}
	addr, open := "127.0.0.1:7465", true
	for i := 0; i < len(args); i++ {
		switch {
		case args[i] == "--no-open":
			open = false
		case args[i] == "--addr" && i+1 < len(args):
			addr = args[i+1]
			i++
		default:
			fmt.Fprintln(env.Stderr, Usage)
			return 64
		}
	}
	host, _, err := net.SplitHostPort(addr)
	if ip := net.ParseIP(host); err != nil || (host != "localhost" && (ip == nil || !ip.IsLoopback())) {
		fmt.Fprintln(env.Stderr, "agister pages: --addr must be a loopback host:port:", addr)
		return 64
	}
	listener, err := env.Listen("tcp", addr)
	if err != nil {
		fmt.Fprintln(env.Stderr, "agister pages:", err)
		return 1
	}
	server := &http.Server{Handler: Handler(env.Runs), ReadHeaderTimeout: 10 * time.Second}
	url := "http://" + listener.Addr().String() + "/"
	fmt.Fprintf(env.Stdout, "Agister pages at %s (Ctrl-C stops)\n", url)
	if open {
		if err := env.Open(url); err != nil {
			fmt.Fprintln(env.Stderr, "agister pages: open:", err)
		}
	}
	served := make(chan error, 1)
	go func() { served <- server.Serve(listener) }()
	select {
	case err := <-served:
		fmt.Fprintln(env.Stderr, "agister pages:", err)
		return 1
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdown); err != nil {
		_ = server.Close()
	}
	<-served
	return 0
}
