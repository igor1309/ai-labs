package composition

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
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
	if d.Content == nil || d.Reading == nil || d.Log == nil {
		return nil, errors.New("content, reading storage and log are required")
	}
	if !standalone && (d.API == nil || d.Transport == nil || d.Wait == nil) {
		return nil, errors.New("API, transport storage and wait are required")
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
		w.Header().Set("X-Agonara-Session", "shared")
		pageHandler.ServeHTTP(w, r)
	})
	return out, nil
}

// Run attaches real infrastructure at the process boundary and joins all work before returning.
func Run(parent context.Context, c Config, standalone bool, log func(string)) error {
	if err := os.MkdirAll(filepath.Dir(c.StatePath), 0o700); err != nil {
		return err
	}
	stateLock, err := ownerlock.Acquire(c.StatePath + ".lock")
	if err != nil {
		return err
	}
	defer stateLock.Close()
	if !standalone {
		pollLock, err := ownerlock.Acquire(filepath.Join("/tmp", fmt.Sprintf("agonara-poller-%x.lock", sha256.Sum256([]byte(c.BotToken)))))
		if err != nil {
			return err
		}
		defer pollLock.Close()
	}
	client, err := agonara.New(c.BaseURL, c.Login, c.Password, &http.Client{Timeout: 40 * time.Second})
	if err != nil {
		return err
	}
	cache, err := agonara.NewCache(client, 5*time.Minute, time.Now)
	if err != nil {
		return err
	}
	assembled, err := Assemble(parent, c, standalone, Dependencies{
		Content: Content{Source: cache}, Reading: sessionstore.ReadingFile{Path: c.StatePath, LegacyWeb: c.LegacyWeb, LegacyBot: c.LegacyBot},
		API:       telegram.Client{Token: c.BotToken, HTTP: &http.Client{Timeout: 40 * time.Second}},
		Transport: sessionstore.TransportFile{Path: c.TransportPath, Legacy: c.LegacyBot}, Wait: wait, Log: log,
	})
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", c.WebAddr)
	if err != nil {
		return err
	}
	defer listener.Close()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	httpServer := &http.Server{Handler: assembled.Handler, ReadHeaderTimeout: 10 * time.Second}
	httpDone := make(chan error, 1)
	go func() { httpDone <- httpServer.Serve(listener) }()
	var pollDone chan error
	if assembled.Poller != nil {
		pollDone = make(chan error, 1)
		go func() { pollDone <- assembled.Poller.Run(ctx) }()
	}
	log("serving on " + listener.Addr().String())
	var result error
	httpJoined, pollJoined := false, pollDone == nil
	select {
	case <-ctx.Done():
	case result = <-httpDone:
		httpJoined = true
	case result = <-pollDone:
		pollJoined = true
	}
	cancel()
	shutdown, stop := context.WithTimeout(context.Background(), 5*time.Second)
	defer stop()
	if err := httpServer.Shutdown(shutdown); err != nil {
		httpServer.Close()
		if result == nil {
			result = err
		}
	}
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
	if errors.Is(result, http.ErrServerClosed) {
		return nil
	}
	return result
}
func wait(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// CheckRunning probes only the local HTTP surface, without credentials or a Telegram request.
type HTTPProbe interface {
	Get(string) (*http.Response, error)
}

func CheckRunning(c Config, client HTTPProbe) error {
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
	if resp.StatusCode != http.StatusUnauthorized || resp.Header.Get("X-Agonara-Session") != "shared" {
		return errors.New("reading HTTP surface has unexpected identity or access guard")
	}
	return nil
}
