package composition

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
)

type closerFunc func() error

func (f closerFunc) Close() error { return f() }

type ownershipSpy struct {
	mu            sync.Mutex
	held          map[string]bool
	calls         []string
	released      []string
	beforeRelease func()
}

func (s *ownershipSpy) acquire(path string) (io.Closer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, path)
	if s.held[path] {
		return nil, errors.New("already owned: " + path)
	}
	s.held[path] = true
	return closerFunc(func() error {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.beforeRelease != nil {
			s.beforeRelease()
		}
		delete(s.held, path)
		s.released = append(s.released, path)
		return nil
	}), nil
}

type runnerAPI func(context.Context, string, map[string]any) (json.RawMessage, error)

func (f runnerAPI) Call(ctx context.Context, method string, p map[string]any) (json.RawMessage, error) {
	return f(ctx, method, p)
}

type runnerHTTP struct {
	serve    func() error
	shutdown func(context.Context) error
	close    func() error
}

func (s *runnerHTTP) Serve() error                       { return s.serve() }
func (s *runnerHTTP) Shutdown(ctx context.Context) error { return s.shutdown(ctx) }
func (s *runnerHTTP) Close() error                       { return s.close() }

func runnerConfig() Config {
	return Config{StatePath: "/states/shared.json", BotToken: "distinct-secret", WebAddr: ":8740", WebToken: "web-access", PageSize: 1000, ChatID: 17}
}

// Integration test: the runner's ownership and lifecycle orchestration with real assembly and controlled infrastructure.
func TestRunnerJoinsBothSurfacesBeforeReleasingOwnership(t *testing.T) {
	t.Parallel()
	for _, cause := range []string{"cancel", "HTTP error", "poll error", "shutdown deadline"} {
		t.Run(cause, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			httpStarted, pollStarted := make(chan struct{}), make(chan struct{})
			httpExit, pollExit := make(chan struct{}), make(chan struct{})
			httpFinished, pollFinished := make(chan struct{}), make(chan struct{})
			shutdownStarted, pollCanceled := make(chan struct{}), make(chan struct{})
			timerStarted, timerStopped := make(chan time.Duration, 1), make(chan struct{})
			timerFired := make(chan time.Time, 1)
			injected := errors.New(cause)
			owners := &ownershipSpy{held: map[string]bool{}}
			owners.beforeRelease = func() {
				select {
				case <-httpFinished:
				default:
					t.Error("ownership released before HTTP finished")
				}
				select {
				case <-pollFinished:
				default:
					t.Error("ownership released before polling finished")
				}
			}
			api := runnerAPI(func(ctx context.Context, method string, _ map[string]any) (json.RawMessage, error) {
				if method == "getMe" {
					return json.RawMessage(`{}`), nil
				}
				if method != "getUpdates" {
					return nil, fmt.Errorf("unexpected %s", method)
				}
				close(pollStarted)
				if cause != "poll error" {
					<-ctx.Done()
					close(pollCanceled)
				}
				<-pollExit
				close(pollFinished)
				return nil, &telegram.Error{Code: 409}
			})
			closes := 0
			httpServer := &runnerHTTP{
				serve: func() error {
					close(httpStarted)
					<-httpExit
					close(httpFinished)
					if cause == "HTTP error" {
						return injected
					}
					return http.ErrServerClosed
				},
				shutdown: func(ctx context.Context) error {
					close(shutdownStarted)
					if cause == "shutdown deadline" {
						<-ctx.Done()
						return ctx.Err()
					}
					return nil
				},
				close: func() error { closes++; return nil },
			}
			c := runnerConfig()
			d := RunnerDependencies{
				Assembly: Dependencies{Content: readingSpy{}, Reading: &memoryStorage{state: flow.InitialState()}, API: api, Transport: &transportSpy{}, Wait: func(context.Context, time.Duration) error { t.Error("unexpected wait"); return nil }, Log: func(string) {}},
				EnsureDirectory: func(path string) error {
					if path != "/states" {
						t.Errorf("directory %s", path)
					}
					return nil
				},
				Acquire: owners.acquire, PollerLockDirectory: "/poll-locks",
				Listen: func(addr string, h http.Handler) (RunningHTTP, error) {
					if addr != c.WebAddr {
						t.Errorf("address %s", addr)
					}
					w := httptest.NewRecorder()
					h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
					if w.Code != 401 || w.Header().Get("X-Agonara-Session") != "shared" {
						t.Errorf("handler %d %v", w.Code, w.Header())
					}
					return httpServer, nil
				},
				Timer: func(d time.Duration) (<-chan time.Time, func()) {
					timerStarted <- d
					return timerFired, func() { close(timerStopped) }
				},
			}
			jobs := make(chan runnerJob, 2)
			starts := 0
			d.Start = func(work func() error) <-chan error {
				starts++
				if starts > 2 {
					return startRunnerWork(work)
				}
				done := make(chan error)
				jobs <- runnerJob{work: work, done: done}
				return done
			}
			done := make(chan error, 1)
			go func() { done <- Run(ctx, c, false, d) }()
			httpJob, pollJob := <-jobs, <-jobs
			httpResult, pollResult := make(chan error, 1), make(chan error, 1)
			go func() { httpResult <- httpJob.work() }()
			go func() { pollResult <- pollJob.work() }()
			<-httpStarted
			<-pollStarted
			switch cause {
			case "HTTP error":
				close(httpExit)
				httpJob.done <- <-httpResult
			case "poll error":
				close(pollExit)
				pollJob.done <- <-pollResult
			default:
				cancel()
			}
			<-shutdownStarted
			if duration := <-timerStarted; duration != 5*time.Second {
				t.Errorf("shutdown timer %v", duration)
			}
			if cause != "poll error" {
				<-pollCanceled
			}
			if cause == "shutdown deadline" {
				timerFired <- time.Time{}
			}
			if cause != "HTTP error" {
				close(httpExit)
				httpJob.done <- <-httpResult
			}
			if cause != "poll error" {
				close(pollExit)
				pollJob.done <- <-pollResult
			}
			err := <-done
			<-timerStopped
			wantCloses := 1
			if cause == "shutdown deadline" {
				wantCloses = 2
			}
			if closes != wantCloses {
				t.Errorf("HTTP closes=%d want=%d", closes, wantCloses)
			}
			switch cause {
			case "cancel":
				if err != nil {
					t.Fatal(err)
				}
			case "HTTP error":
				if !errors.Is(err, injected) {
					t.Fatal(err)
				}
			case "poll error":
				var conflict *telegram.Error
				if !errors.As(err, &conflict) || conflict.Code != 409 {
					t.Fatal(err)
				}
			case "shutdown deadline":
				if !errors.Is(err, context.Canceled) {
					t.Fatal(err)
				}
			}
			stateKey := c.StatePath + ".lock"
			tokenKey := filepath.Join("/poll-locks", fmt.Sprintf("agonara-poller-%x.lock", sha256.Sum256([]byte(c.BotToken))))
			if !reflect.DeepEqual(owners.calls, []string{stateKey, tokenKey}) || !reflect.DeepEqual(owners.released, []string{tokenKey, stateKey}) || len(owners.held) != 0 {
				t.Fatalf("calls=%v releases=%v held=%v", owners.calls, owners.released, owners.held)
			}
		})
	}
}

func TestRunnerRejectsOverlappingStateAndTokenOwners(t *testing.T) {
	t.Parallel()
	for _, sharedState := range []bool{true, false} {
		t.Run(fmt.Sprint(sharedState), func(t *testing.T) {
			t.Parallel()
			owners := &ownershipSpy{held: map[string]bool{}}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			httpStarted, pollStarted, shutdown := make(chan struct{}), make(chan struct{}), make(chan struct{})
			httpServer := &runnerHTTP{serve: func() error { close(httpStarted); <-shutdown; return http.ErrServerClosed }, shutdown: func(context.Context) error { close(shutdown); return nil }, close: func() error { return nil }}
			api := runnerAPI(func(ctx context.Context, m string, _ map[string]any) (json.RawMessage, error) {
				if m == "getMe" {
					return json.RawMessage(`{}`), nil
				}
				close(pollStarted)
				<-ctx.Done()
				return nil, ctx.Err()
			})
			makeDeps := func() RunnerDependencies {
				return RunnerDependencies{Assembly: Dependencies{Content: readingSpy{}, Reading: &memoryStorage{state: flow.InitialState()}, API: api, Transport: &transportSpy{}, Wait: func(context.Context, time.Duration) error { return nil }, Log: func(string) {}}, EnsureDirectory: func(string) error { return nil }, Acquire: owners.acquire, PollerLockDirectory: "/locks", Listen: func(string, http.Handler) (RunningHTTP, error) { return httpServer, nil }, Start: startRunnerWork, Timer: func(time.Duration) (<-chan time.Time, func()) { return make(chan time.Time), func() {} }}
			}
			first := runnerConfig()
			done := make(chan error, 1)
			go func() { done <- Run(ctx, first, false, makeDeps()) }()
			<-httpStarted
			<-pollStarted
			second := first
			if !sharedState {
				second.StatePath = "/other/reading.json"
				second.WebAddr = ":8741"
			}
			deps := makeDeps()
			deps.Listen = func(string, http.Handler) (RunningHTTP, error) {
				t.Error("contending runner opened listener")
				return nil, errors.New("unexpected listener")
			}
			deps.Assembly.API = runnerAPI(func(context.Context, string, map[string]any) (json.RawMessage, error) {
				t.Error("contending runner authenticated")
				return nil, errors.New("unexpected API")
			})
			err := Run(context.Background(), second, false, deps)
			if err == nil {
				t.Error("overlapping owner accepted")
			}
			cancel()
			if err := <-done; err != nil {
				t.Fatal(err)
			}
			stateKey := first.StatePath + ".lock"
			tokenKey := filepath.Join("/locks", fmt.Sprintf("agonara-poller-%x.lock", sha256.Sum256([]byte(first.BotToken))))
			want := []string{stateKey, tokenKey, second.StatePath + ".lock"}
			if !sharedState {
				want = append(want, tokenKey)
			}
			if !reflect.DeepEqual(owners.calls, want) || len(owners.held) != 0 {
				t.Fatalf("calls=%v want=%v held=%v", owners.calls, want, owners.held)
			}
		})
	}
}

func TestStandaloneRunnerSkipsPollerOwnershipAndInfrastructure(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	started, stopped := make(chan struct{}), make(chan struct{})
	owners := &ownershipSpy{held: map[string]bool{}}
	server := &runnerHTTP{serve: func() error { close(started); <-stopped; return http.ErrServerClosed }, shutdown: func(context.Context) error { close(stopped); return nil }, close: func() error { return nil }}
	d := RunnerDependencies{Assembly: Dependencies{Content: readingSpy{}, Reading: &memoryStorage{state: flow.InitialState()}, Log: func(string) {}}, EnsureDirectory: func(string) error { return nil }, Acquire: owners.acquire, Listen: func(_ string, h http.Handler) (RunningHTTP, error) {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
		if w.Header().Get("X-Agonara-Session") != "standalone" {
			t.Error(w.Header())
		}
		return server, nil
	}, Start: startRunnerWork, Timer: func(time.Duration) (<-chan time.Time, func()) { return make(chan time.Time), func() {} }}
	done := make(chan error, 1)
	go func() { done <- Run(ctx, runnerConfig(), true, d) }()
	<-started
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(owners.calls, []string{"/states/shared.json.lock"}) || !reflect.DeepEqual(owners.released, owners.calls) {
		t.Fatalf("%v %v", owners.calls, owners.released)
	}
}

func TestRunnerRejectsMissingCollaboratorsBeforeInfrastructure(t *testing.T) {
	t.Parallel()
	for _, missing := range []string{"directory", "ownership", "lock directory", "listener", "timer", "starter", "content", "reading", "API", "transport", "wait", "log"} {
		t.Run(missing, func(t *testing.T) {
			t.Parallel()
			d := RunnerDependencies{Assembly: Dependencies{Content: readingSpy{}, Reading: &memoryStorage{state: flow.InitialState()}, API: &messageAPI{}, Transport: &transportSpy{}, Wait: func(context.Context, time.Duration) error { return nil }, Log: func(string) {}}, EnsureDirectory: func(string) error { t.Error("infrastructure called"); return nil }, Acquire: func(string) (io.Closer, error) { t.Error("ownership called"); return nil, nil }, PollerLockDirectory: "/locks", Listen: func(string, http.Handler) (RunningHTTP, error) { t.Error("listener called"); return nil, nil }, Start: startRunnerWork, Timer: func(time.Duration) (<-chan time.Time, func()) { t.Error("timer called"); return nil, nil }}
			switch missing {
			case "directory":
				d.EnsureDirectory = nil
			case "ownership":
				d.Acquire = nil
			case "lock directory":
				d.PollerLockDirectory = ""
			case "listener":
				d.Listen = nil
			case "timer":
				d.Timer = nil
			case "starter":
				d.Start = nil
			case "content":
				d.Assembly.Content = nil
			case "reading":
				d.Assembly.Reading = nil
			case "API":
				d.Assembly.API = nil
			case "transport":
				d.Assembly.Transport = nil
			case "wait":
				d.Assembly.Wait = nil
			case "log":
				d.Assembly.Log = nil
			}
			if err := Run(context.Background(), runnerConfig(), false, d); err == nil {
				t.Fatalf("missing %s accepted", missing)
			}
		})
	}
}

type runnerJob struct {
	work func() error
	done chan error
}

func startRunnerWork(work func() error) <-chan error {
	done := make(chan error, 1)
	go func() { done <- work() }()
	return done
}

type runnerTransport struct {
	load func() (telegram.State, error)
}

func (s runnerTransport) Load() (telegram.State, error) { return s.load() }
func (s runnerTransport) Save(telegram.State) error     { return nil }

func TestRunnerStartupFailuresReleaseOwnershipWithoutPublishingSurfaces(t *testing.T) {
	t.Parallel()
	for _, failure := range []string{"directory", "state lock", "poll lock", "auth", "transport", "listen"} {
		t.Run(failure, func(t *testing.T) {
			t.Parallel()
			var events []string
			injected := errors.New(failure)
			d := RunnerDependencies{
				Assembly: Dependencies{Content: readingSpy{}, Reading: &memoryStorage{state: flow.InitialState()},
					API: runnerAPI(func(_ context.Context, m string, _ map[string]any) (json.RawMessage, error) {
						events = append(events, m)
						if failure == "auth" {
							return nil, injected
						}
						return json.RawMessage(`{}`), nil
					}),
					Transport: runnerTransport{load: func() (telegram.State, error) {
						events = append(events, "transport")
						if failure == "transport" {
							return telegram.State{}, injected
						}
						return telegram.State{}, nil
					}},
					Wait: func(context.Context, time.Duration) error { t.Error("wait before startup"); return nil }, Log: func(string) {}},
				EnsureDirectory: func(string) error {
					events = append(events, "directory")
					if failure == "directory" {
						return injected
					}
					return nil
				},
				Acquire: func(path string) (io.Closer, error) {
					name := "poll lock"
					if path == "/states/shared.json.lock" {
						name = "state lock"
					}
					events = append(events, name)
					if failure == name {
						return nil, injected
					}
					return closerFunc(func() error { events = append(events, "release "+name); return nil }), nil
				},
				PollerLockDirectory: "/locks",
				Listen: func(string, http.Handler) (RunningHTTP, error) {
					events = append(events, "listen")
					return nil, injected
				},
				Timer: func(time.Duration) (<-chan time.Time, func()) { t.Error("timer before startup"); return nil, nil },
				Start: func(func() error) <-chan error { t.Error("work before startup"); return nil },
			}
			err := Run(context.Background(), runnerConfig(), false, d)
			if !errors.Is(err, injected) {
				t.Fatalf("%v", err)
			}
			var want []string
			switch failure {
			case "directory":
				want = []string{"directory"}
			case "state lock":
				want = []string{"directory", "state lock"}
			case "poll lock":
				want = []string{"directory", "state lock", "poll lock", "release state lock"}
			default:
				want = []string{"directory", "state lock", "poll lock", "getMe"}
				if failure != "auth" {
					want = append(want, "transport")
				}
				if failure == "listen" {
					want = append(want, "listen")
				}
				want = append(want, "release poll lock", "release state lock")
			}
			if !reflect.DeepEqual(events, want) {
				t.Fatalf("events=%v want=%v", events, want)
			}
		})
	}
}

type blockedReadingStorage struct {
	entered chan flow.State
	finish  <-chan struct{}
	saved   chan flow.State
	err     error
}

func (s *blockedReadingStorage) Load() (flow.State, error) { return flow.InitialState(), nil }
func (s *blockedReadingStorage) Save(v flow.State) error {
	s.entered <- v
	<-s.finish
	s.saved <- v
	return s.err
}

// Integration test: both runner modes drain real HTTP actions through a blocked storage spy and manual lifecycle completion.
func TestRunnerDrainsWritingHandlersAfterForcedClose(t *testing.T) {
	t.Parallel()
	for _, standalone := range []bool{false, true} {
		for _, saveFails := range []bool{false, true} {
			t.Run(fmt.Sprintf("standalone=%v/saveFails=%v", standalone, saveFails), func(t *testing.T) {
				t.Parallel()
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				finish := make(chan struct{})
				var finishOnce sync.Once
				unblock := func() { finishOnce.Do(func() { close(finish) }) }
				defer unblock()
				saved := make(chan flow.State, 1)
				storage := &blockedReadingStorage{entered: make(chan flow.State, 1), finish: finish, saved: saved}
				if saveFails {
					storage.err = errors.New("sync failed")
				}
				actionDone := make(chan *httptest.ResponseRecorder, 1)
				handlers := make(chan http.Handler, 1)
				serveExit := make(chan struct{})
				forcedClose := make(chan struct{})
				var closeOnce sync.Once
				timerStarted := make(chan time.Duration, 1)
				fired := make(chan time.Time, 1)
				jobs := make(chan runnerJob, 3)
				owners := &ownershipSpy{held: map[string]bool{}}
				owners.beforeRelease = func() {
					select {
					case v := <-saved:
						if v.Current.EntityID != "m" || v.Current.Step != 1 {
							t.Errorf("unfinished action: %+v", v)
						}
						saved <- v
					default:
						t.Error("ownership released before storage finished")
					}
				}
				server := &runnerHTTP{
					serve:    func() error { <-serveExit; return http.ErrServerClosed },
					shutdown: func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() },
					close:    func() error { closeOnce.Do(func() { close(forcedClose); close(serveExit) }); return nil },
				}
				api := runnerAPI(func(ctx context.Context, method string, _ map[string]any) (json.RawMessage, error) {
					if method == "getMe" {
						return json.RawMessage(`{}`), nil
					}
					if method != "getUpdates" {
						t.Errorf("unexpected API method %s", method)
					}
					<-ctx.Done()
					return nil, ctx.Err()
				})
				d := RunnerDependencies{
					Assembly:        Dependencies{Content: readingSpy{}, Reading: storage, API: api, Transport: &transportSpy{}, Wait: func(context.Context, time.Duration) error { t.Error("unexpected polling wait"); return nil }, Log: func(string) {}},
					EnsureDirectory: func(string) error { return nil }, Acquire: owners.acquire, PollerLockDirectory: "/locks",
					Listen: func(_ string, h http.Handler) (RunningHTTP, error) { handlers <- h; return server, nil },
					Timer: func(duration time.Duration) (<-chan time.Time, func()) {
						timerStarted <- duration
						return fired, func() {}
					},
					Start: func(work func() error) <-chan error {
						done := make(chan error)
						jobs <- runnerJob{work: work, done: done}
						return done
					},
				}
				done := make(chan error, 1)
				config := runnerConfig()
				config.WebToken = "access"
				go func() { done <- Run(ctx, config, standalone, d) }()
				h := <-handlers
				httpJob := <-jobs
				httpResult := startRunnerWork(httpJob.work)
				var pollJob runnerJob
				var pollResult <-chan error
				if !standalone {
					pollJob = <-jobs
					pollResult = startRunnerWork(pollJob.work)
				}
				go func() { actionDone <- request(t, h, "/m/m?page=1") }()
				candidate := <-storage.entered
				if candidate.Current.EntityID != "m" || candidate.Current.Step != 1 {
					t.Errorf("save candidate %+v", candidate)
				}
				cancel()
				drainJob := <-jobs
				drainResult := startRunnerWork(drainJob.work)
				if duration := <-timerStarted; duration != 5*time.Second {
					t.Errorf("timer %v", duration)
				}
				// Admission has stopped before the deadline; even an uncancelled request cannot enter the session.
				rejected := request(t, h, "/m/m?page=2")
				if rejected.Code != http.StatusServiceUnavailable {
					t.Errorf("new action admitted during shutdown: %d", rejected.Code)
				}
				fired <- time.Time{}
				<-forcedClose
				httpJob.done <- <-httpResult
				if !standalone {
					pollJob.done <- <-pollResult
				}
				if lock, err := owners.acquire(runnerConfig().StatePath + ".lock"); err == nil {
					lock.Close()
					t.Error("replacement acquired ownership during the old write")
				}
				unblock()
				response := <-actionDone
				wantCode := http.StatusOK
				if saveFails {
					wantCode = http.StatusBadGateway
				}
				if response.Code != wantCode {
					t.Errorf("completed action status=%d want=%d: %s", response.Code, wantCode, response.Body.String())
				}
				// Completion delivery is controlled separately from Serve and polling, proving Run joins the drain.
				drainJob.done <- <-drainResult
				if err := <-done; !errors.Is(err, context.Canceled) {
					t.Errorf("shutdown result %v", err)
				}
				wantReleases := 1
				if !standalone {
					wantReleases = 2
				}
				if len(owners.released) != wantReleases || len(owners.held) != 0 {
					t.Errorf("ownership left held: %+v", owners)
				}
			})
		}
	}
}

func TestHTTPAdmissionCompletesOnlyAfterEveryAcceptedHandlerReturns(t *testing.T) {
	t.Parallel()
	for _, count := range []int{0, 1, 2} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			t.Parallel()
			entered := make(chan struct{}, count)
			exits := make([]chan struct{}, count)
			finished := make([]chan struct{}, count)
			for i := range exits {
				exits[i] = make(chan struct{})
				finished[i] = make(chan struct{})
			}
			h := &admittedHTTP{drained: make(chan struct{}), next: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				i := 0
				if r.URL.Path == "/second" {
					i = 1
				}
				entered <- struct{}{}
				<-exits[i]
				w.WriteHeader(http.StatusAccepted)
			})}
			for i := range exits {
				go func() {
					path := "/first"
					if i == 1 {
						path = "/second"
					}
					w := httptest.NewRecorder()
					h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
					if w.Code != http.StatusAccepted {
						t.Errorf("accepted handler status %d", w.Code)
					}
					close(finished[i])
				}()
			}
			for range count {
				<-entered
			}
			drained := h.stop()
			// Stopping is idempotent, including when no work was admitted.
			if h.stop() != drained {
				t.Error("stopping changed completion channel")
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest("GET", "/late", nil))
			if w.Code != http.StatusServiceUnavailable {
				t.Errorf("late handler status %d", w.Code)
			}
			for i := range exits {
				// All remaining handlers are blocked, so their completion cannot race this assertion.
				select {
				case <-drained:
					t.Error("reported completion with active handlers")
				default:
				}
				close(exits[i])
				<-finished[i]
			}
			<-drained
			if len(entered) != 0 {
				t.Error("late request reached the wrapped handler")
			}
		})
	}
}
