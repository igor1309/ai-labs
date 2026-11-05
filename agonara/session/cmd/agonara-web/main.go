// Command agonara-web serves the session as a web page on the local network,
// reading Agonara as the same student as the bot.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
	"github.com/igor1309/ai-labs/agonara/session/internal/envfile"
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/web"
)

func log(message string) {
	fmt.Printf("%s %s\n", time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), message)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	envFile := flag.String("env-file", "", "file of KEY=VALUE lines to load into the environment")
	flag.Parse()
	if *envFile != "" {
		if err := envfile.Load(*envFile); err != nil {
			return err
		}
	}
	token := os.Getenv("WEB_TOKEN")
	baseURL, login, password := os.Getenv("AGONARA_BASE_URL"), os.Getenv("AGONARA_LOGIN"), os.Getenv("AGONARA_PASSWORD")
	if token == "" || baseURL == "" || login == "" || password == "" {
		return errors.New("WEB_TOKEN, AGONARA_BASE_URL, AGONARA_LOGIN and AGONARA_PASSWORD are required")
	}
	addr := os.Getenv("WEB_ADDR")
	if addr == "" {
		addr = ":8740"
	}
	client, err := agonara.New(baseURL, login, password, nil)
	if err != nil {
		return err
	}
	pageSize, _ := strconv.Atoi(os.Getenv("SESSION_PAGE_SIZE"))
	placePath := os.Getenv("WEB_PLACE_PATH")
	if placePath == "" && os.Getenv("SESSION_STATE_PATH") != "" {
		placePath = filepath.Join(filepath.Dir(os.Getenv("SESSION_STATE_PATH")), "web-place.json")
	}
	cache := &web.Cache{Reader: client, TTL: 5 * time.Minute}
	server := &web.Server{Flow: flow.Flow{Reader: cache, PageSize: pageSize}, Token: token, PlacePath: placePath, Log: log}
	handler, err := server.Handler()
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	httpServer := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		httpServer.Shutdown(shutdown)
	}()
	log("serving on " + listener.Addr().String())
	if err := httpServer.Serve(listener); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
