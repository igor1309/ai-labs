// Command agonara-session runs both reading surfaces over one session owner.
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agonara/session/internal/composition"
	"github.com/igor1309/ai-labs/agonara/session/internal/envfile"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	envFile := flag.String("env-file", "", "file of KEY=VALUE lines")
	probe := flag.Bool("check-running", false, "check local reading HTTP availability without contacting Telegram")
	check := flag.Bool("check-config", false, "validate configuration without starting services")
	flag.Parse()
	if *envFile != "" {
		if err := envfile.Load(*envFile); err != nil {
			return err
		}
	}
	config, err := composition.Configuration(os.Getenv, false, composition.ResolveStatePath)
	if err != nil {
		return err
	}
	if *probe {
		return composition.CheckRunning(config, false, &http.Client{Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }})
	}
	if *check {
		fmt.Println("configuration valid")
		return nil
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return composition.RunProduction(ctx, config, false, func(message string) { fmt.Printf("%s %s\n", time.Now().UTC().Format(time.RFC3339Nano), message) })
}
