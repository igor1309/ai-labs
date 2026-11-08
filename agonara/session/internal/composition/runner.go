package composition

import (
	"context"
	"crypto/sha256"
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
	activity, err := flow.New(Content{Source: cache}, c.PageSize)
	if err != nil {
		return err
	}
	service, err := flow.NewService(activity, sessionstore.ReadingFile{Path: c.StatePath, LegacyWeb: c.LegacyWeb, LegacyBot: c.LegacyBot})
	if err != nil {
		return err
	}
	server := &web.Server{Session: Web{Session: service}, Token: c.WebToken, Log: log}
	pageHandler, err := server.Handler()
	if err != nil {
		return err
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Agonara-Session", "shared")
		pageHandler.ServeHTTP(w, r)
	})
	listener, err := net.Listen("tcp", c.WebAddr)
	if err != nil {
		return err
	}
	defer listener.Close()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	httpServer := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	httpDone := make(chan error, 1)
	go func() { httpDone <- httpServer.Serve(listener) }()
	var pollDone chan error
	if !standalone {
		api := telegram.Client{Token: c.BotToken, HTTP: &http.Client{Timeout: 40 * time.Second}}
		bot, err := telegram.NewBot(api, Telegram{Session: service}, c.ChatID, log)
		if err != nil {
			httpServer.Close()
			<-httpDone
			return err
		}
		poller, err := telegram.NewPoller(api, bot, sessionstore.TransportFile{Path: c.TransportPath, Legacy: c.LegacyBot}, wait, log)
		if err != nil {
			httpServer.Close()
			<-httpDone
			return err
		}
		pollDone = make(chan error, 1)
		go func() { pollDone <- poller.Run(ctx) }()
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
