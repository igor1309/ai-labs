package composition

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/ownerlock"
	"github.com/igor1309/ai-labs/agonara/session/internal/sessionstore"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
	"github.com/igor1309/ai-labs/agonara/session/internal/web"
)

// AssemblyAPI is the initialization and transport capability the runner connects.
type AssemblyAPI interface {
	Call(context.Context, string, map[string]any) (json.RawMessage, error)
}
type ReadingStorage interface {
	Load() (flow.State, error)
	Save(flow.State) error
}
type TransportStorage interface {
	Load() (telegram.State, error)
	Save(telegram.State) error
}
type ReadingContent interface {
	ListPrograms(context.Context) ([]flow.CatalogEntry, error)
	Navigation(context.Context, string) (flow.Navigation, error)
	Entity(context.Context, string) (flow.Entity, error)
	MaterialContent(context.Context, string) (string, error)
}
type Dependencies struct {
	Content   ReadingContent
	Reading   ReadingStorage
	API       AssemblyAPI
	Transport TransportStorage
	Wait      func(context.Context, time.Duration) error
	Log       func(string)
}
type Assembly struct {
	Handler  http.Handler
	Bot      *telegram.Bot
	Poller   *telegram.Poller
	Web      Web
	Telegram Telegram
}

// Assemble is used before opening the HTTP listener. All fallible initialization,
// including authentication and transport loading, precedes a publishable handler.
func Assemble(ctx context.Context, c Config, standalone bool, d Dependencies) (*Assembly, error) {
	if err := validateDependencies(standalone, d); err != nil {
		return nil, err
	}
	activity, err := flow.New(d.Content, c.PageSize)
	if err != nil {
		return nil, err
	}
	service, err := flow.NewService(activity, d.Reading)
	if err != nil {
		return nil, err
	}
	out := &Assembly{Web: Web{Session: service}}
	if !standalone {
		if _, err := d.API.Call(ctx, "getMe", nil); err != nil {
			return nil, fmt.Errorf("authenticate Telegram: %w", err)
		}
		out.Telegram = Telegram{Session: service}
		bot, err := telegram.NewBot(d.API, out.Telegram, c.ChatID, d.Log)
		if err != nil {
			return nil, err
		}
		poller, err := telegram.NewPoller(d.API, bot, d.Transport, d.Wait, d.Log)
		if err != nil {
			return nil, err
		}
		out.Bot, out.Poller = &bot, poller
	}
	server := &web.Server{Session: out.Web, Token: c.WebToken, Log: d.Log}
	pageHandler, err := server.Handler()
	if err != nil {
		return nil, err
	}
	out.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Agonara-Session", readinessIdentity(standalone))
		pageHandler.ServeHTTP(w, r)
	})
	return out, nil
}

// RunningHTTP owns the bound listener and the HTTP work it serves.
type RunningHTTP interface {
	Serve() error
	Shutdown(context.Context) error
	Close() error
}

type RunnerDependencies struct {
	Assembly            Dependencies
	EnsureDirectory     func(string) error
	Acquire             func(string) (io.Closer, error)
	PollerLockDirectory string
	Listen              func(string, http.Handler) (RunningHTTP, error)
	Timer               func(time.Duration) (<-chan time.Time, func())
	// Start delivers one result only after the supplied work has finished.
	Start func(func() error) <-chan error
}

// Run holds ownership until HTTP handlers and polling have finished.
func Run(parent context.Context, c Config, standalone bool, d RunnerDependencies) error {
	if d.EnsureDirectory == nil || d.Acquire == nil || d.Listen == nil || d.Timer == nil || d.Start == nil || (!standalone && !filepath.IsAbs(d.PollerLockDirectory)) {
		return errors.New("directory, ownership, listener, timer, work starter and absolute poller lock directory are required")
	}
	if err := validateDependencies(standalone, d.Assembly); err != nil {
		return err
	}
	if err := d.EnsureDirectory(filepath.Dir(c.StatePath)); err != nil {
		return err
	}
	stateLock, err := d.Acquire(c.StatePath + ".lock")
	if err != nil {
		return err
	}
	defer stateLock.Close()
	if !standalone {
		pollLock, err := d.Acquire(filepath.Join(d.PollerLockDirectory, fmt.Sprintf("agonara-poller-%x.lock", sha256.Sum256([]byte(c.BotToken)))))
		if err != nil {
			return err
		}
		defer pollLock.Close()
	}
	assembled, err := Assemble(parent, c, standalone, d.Assembly)
	if err != nil {
		return err
	}
	handlers := &admittedHTTP{next: assembled.Handler, drained: make(chan struct{})}
	httpServer, err := d.Listen(c.WebAddr, handlers)
	if err != nil {
		return err
	}
	defer httpServer.Close()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	httpDone := d.Start(httpServer.Serve)
	var pollDone <-chan error
	if assembled.Poller != nil {
		pollDone = d.Start(func() error { return assembled.Poller.Run(ctx) })
	}
	d.Assembly.Log("serving on " + c.WebAddr)
	var result error
	httpJoined, pollJoined := false, pollDone == nil
	select {
	case <-ctx.Done():
	case result = <-httpDone:
		httpJoined = true
	case result = <-pollDone:
		pollJoined = true
	}
	drained := handlers.stop()
	cancel()
	handlersDone := d.Start(func() error { <-drained; return nil })
	shutdown, stop := context.WithCancel(context.Background())
	fired, stopTimer := d.Timer(5 * time.Second)
	timerDone := make(chan struct{})
	go func() {
		defer close(timerDone)
		select {
		case <-fired:
			stop()
		case <-shutdown.Done():
		}
	}()
	if err := httpServer.Shutdown(shutdown); err != nil {
		httpServer.Close()
		if result == nil {
			result = err
		}
	}
	stop()
	stopTimer()
	<-timerDone
	if !httpJoined {
		err := <-httpDone
		if result == nil {
			result = err
		}
	}
	if !pollJoined {
		err := <-pollDone
		if result == nil {
			result = err
		}
	}
	// Closing connections cannot cancel or join an in-flight filesystem write.
	<-handlersDone
	if errors.Is(result, http.ErrServerClosed) {
		return nil
	}
	return result
}

// Admission and stopping share a lock so every accepted handler belongs to the drain.
type admittedHTTP struct {
	next     http.Handler
	mu       sync.Mutex
	stopping bool
	active   int
	drained  chan struct{}
}

func (h *admittedHTTP) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	if h.stopping {
		h.mu.Unlock()
		http.Error(w, "session is stopping", http.StatusServiceUnavailable)
		return
	}
	h.active++
	h.mu.Unlock()
	defer h.complete()
	h.next.ServeHTTP(w, r)
}
func (h *admittedHTTP) complete() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.active--
	if h.stopping && h.active == 0 {
		close(h.drained)
	}
}
func (h *admittedHTTP) stop() <-chan struct{} {
	h.mu.Lock()
	defer h.mu.Unlock()
	if !h.stopping {
		h.stopping = true
		if h.active == 0 {
			close(h.drained)
		}
	}
	return h.drained
}

// CheckRunning probes only the local HTTP surface, without credentials or a Telegram request.
type HTTPProbe interface {
	Get(string) (*http.Response, error)
}

func CheckRunning(c Config, standalone bool, client HTTPProbe) error {
	if client == nil {
		return errors.New("HTTP probe is required")
	}
	host, port, err := net.SplitHostPort(c.WebAddr)
	if err != nil {
		return err
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	resp, err := client.Get("http://" + net.JoinHostPort(host, port) + "/")
	if err != nil {
		return errors.New("reading HTTP surface unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized || resp.Header.Get("X-Agonara-Session") != readinessIdentity(standalone) {
		return errors.New("reading HTTP surface has unexpected identity or access guard")
	}
	return nil
}

func readinessIdentity(standalone bool) string {
	if standalone {
		return "standalone"
	}
	return "shared"
}

func validateDependencies(standalone bool, d Dependencies) error {
	if d.Content == nil || d.Reading == nil || d.Log == nil {
		return errors.New("content, reading storage and log are required")
	}
	if !standalone && (d.API == nil || d.Transport == nil || d.Wait == nil) {
		return errors.New("API, transport storage and wait are required")
	}
	return nil
}

// RunProduction attaches filesystem, kernel, HTTP and time adapters at the process edge.
func RunProduction(ctx context.Context, c Config, standalone bool, log func(string)) error {
	client, err := agonara.New(c.BaseURL, c.Login, c.Password, &http.Client{Timeout: 40 * time.Second})
	if err != nil {
		return err
	}
	cache, err := agonara.NewCache(client, 5*time.Minute, time.Now)
	if err != nil {
		return err
	}
	reading, err := newReadingPersistence(c)
	if err != nil {
		return err
	}
	return Run(ctx, c, standalone, RunnerDependencies{
		Assembly:            Dependencies{Content: Content{Source: cache}, Reading: reading, API: telegram.Client{Token: c.BotToken, HTTP: &http.Client{Timeout: 40 * time.Second}}, Transport: TransportPersistence{Records: sessionstore.TransportFile{Path: c.TransportPath, Legacy: c.LegacyBot}}, Wait: wait, Log: log},
		EnsureDirectory:     func(path string) error { return os.MkdirAll(path, 0o700) },
		Acquire:             func(path string) (io.Closer, error) { return ownerlock.Acquire(path) },
		PollerLockDirectory: "/tmp",
		Listen: func(addr string, handler http.Handler) (RunningHTTP, error) {
			listener, err := net.Listen("tcp", addr)
			if err != nil {
				return nil, err
			}
			return &boundHTTP{server: &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second}, listener: listener}, nil
		},
		Start: startWork,
		Timer: func(d time.Duration) (<-chan time.Time, func()) {
			timer := time.NewTimer(d)
			return timer.C, func() { timer.Stop() }
		},
	})
}

func startWork(work func() error) <-chan error {
	done := make(chan error, 1)
	go func() { done <- work() }()
	return done
}
