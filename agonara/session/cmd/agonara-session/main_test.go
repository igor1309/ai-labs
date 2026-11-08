package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// commandBinary is built once before tests and only read while they run.
var commandBinary string

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "agonara-session-command-*")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	commandBinary = filepath.Join(dir, "agonara-session")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	build := exec.CommandContext(ctx, "go", "build", "-o", commandBinary, ".")
	output, err := build.CombinedOutput()
	cancel()
	code := 1
	if err != nil {
		fmt.Fprintf(os.Stderr, "build runner: %v\n%s", err, output)
	} else {
		code = m.Run()
	}
	if err := os.RemoveAll(dir); err != nil {
		fmt.Fprintln(os.Stderr, err)
		code = 1
	}
	os.Exit(code)
}

// Contract test: deployment flags are parsed by the real runner using an env file and controlled local HTTP.
func TestDeploymentCommandContract(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, flag, invalid, identity, output string
		status, exit, requests                int
	}{
		{name: "configuration", flag: "-check-config", output: "configuration valid"},
		{name: "invalid configuration", flag: "-check-config", invalid: "base URL", exit: 1, output: "invalid AGONARA_BASE_URL"},
		{name: "missing combined configuration", flag: "-check-config", invalid: "bot token", exit: 1, output: "BOT_TOKEN, CHAT_ID, SESSION_SHARED_STATE_PATH and TELEGRAM_STATE_PATH are required"},
		{name: "readiness validates configuration", flag: "-check-running", invalid: "base URL", exit: 1, output: "invalid AGONARA_BASE_URL"},
		{name: "ready shared owner", flag: "-check-running", status: 401, identity: "shared", requests: 1},
		{name: "standalone is not ready", flag: "-check-running", status: 401, identity: "standalone", exit: 1, requests: 1, output: "reading HTTP surface has unexpected identity or access guard"},
		{name: "unguarded is not ready", flag: "-check-running", status: 200, identity: "shared", exit: 1, requests: 1, output: "reading HTTP surface has unexpected identity or access guard"},
		{name: "HTTP failure is not ready", flag: "-check-running", status: 503, identity: "shared", exit: 1, requests: 1, output: "reading HTTP surface has unexpected identity or access guard"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var requests atomic.Int32
			probeURL, webAddr := "http://127.0.0.1:1", "127.0.0.1:8740"
			// Only readiness checks need a listener; configuration checks must finish before HTTP.
			if tc.requests != 0 {
				listener, err := net.Listen("tcp", "127.0.0.1:0")
				if err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { listener.Close() })
				server := &httptest.Server{Listener: listener, Config: &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					requests.Add(1)
					if r.Method != "GET" || r.URL.RequestURI() != "/" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
						t.Errorf("unexpected readiness request: %s %s", r.Method, r.URL.RequestURI())
					}
					w.Header().Set("X-Agonara-Session", tc.identity)
					w.WriteHeader(tc.status)
				})}}
				server.Start()
				t.Cleanup(server.Close)
				probeURL, webAddr = server.URL, listener.Addr().String()
			}
			dir := t.TempDir()
			baseURL, botToken := probeURL, "contract-token"
			if tc.invalid == "base URL" {
				baseURL = "invalid"
			}
			if tc.invalid == "bot token" {
				botToken = ""
			}
			envFile := filepath.Join(dir, "runner.env")
			env := []string{
				"AGONARA_BASE_URL=" + baseURL, "AGONARA_LOGIN=contract-login", "AGONARA_PASSWORD=contract-password", "WEB_TOKEN=contract-web-token",
				"BOT_TOKEN=" + botToken, "CHAT_ID=17", "WEB_ADDR=" + webAddr,
				"SESSION_SHARED_STATE_PATH=" + filepath.Join(dir, "reading.json"), "TELEGRAM_STATE_PATH=" + filepath.Join(dir, "transport.json"),
			}
			if err := os.WriteFile(envFile, []byte(strings.Join(env, "\n")+"\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			cmd := exec.CommandContext(t.Context(), commandBinary, "-env-file="+envFile, tc.flag)
			// Keep even an accidental service-start dispatch inside the controlled HTTP boundary.
			cmd.Env = []string{"HTTP_PROXY=" + probeURL, "HTTPS_PROXY=" + probeURL, "NO_PROXY=127.0.0.1,localhost"}
			output, err := cmd.CombinedOutput()
			exit := 0
			if err != nil {
				failure, ok := err.(*exec.ExitError)
				if !ok {
					t.Fatal(err)
				}
				exit = failure.ExitCode()
			}
			if exit != tc.exit || strings.TrimSpace(string(output)) != tc.output || int(requests.Load()) != tc.requests {
				t.Fatalf("exit=%d output=%q requests=%d; want exit=%d output=%q requests=%d", exit, output, requests.Load(), tc.exit, tc.output, tc.requests)
			}
			for _, name := range []string{"reading.json", "transport.json", "reading.json.lock"} {
				if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
					t.Fatalf("check created %s: %v", name, err)
				}
			}
		})
	}
}
