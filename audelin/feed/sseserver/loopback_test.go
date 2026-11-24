package sseserver_test

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/sseserver"
)

func TestS6_OnlyThisMacCanConnect(t *testing.T) {
	ln, err := sseserver.Listen(0)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port
	if !ln.Addr().(*net.TCPAddr).IP.IsLoopback() {
		t.Fatalf("listens on %v", ln.Addr())
	}
	external := nonLoopbackAddress(t)

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(external, strconv.Itoa(port)), 2*time.Second)

	if err == nil {
		conn.Close()
		t.Fatalf("connected through %s", external)
	}
}

func nonLoopbackAddress(t *testing.T) string {
	t.Helper()
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range addrs {
		if n, ok := a.(*net.IPNet); ok && !n.IP.IsLoopback() && n.IP.To4() != nil {
			return n.IP.String()
		}
	}
	t.Skip("this machine has no network address other than loopback")
	return ""
}

func TestS8_AWebPageCannotReadTheStream(t *testing.T) {
	src := newSource()
	srv := httptest.NewServer(sseserver.NewHandler(src))
	t.Cleanup(srv.Close)

	for _, host := range []string{"evil.example", "evil.example:80", "192.168.1.5"} {
		req, _ := http.NewRequest("GET", srv.URL+"/events?size=60", nil)
		req.Host = host
		req.Header.Set("Origin", "http://evil.example")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden || !strings.Contains(string(body), "loopback") {
			t.Errorf("host %s: %d %q", host, resp.StatusCode, body)
		}
	}
	select {
	case <-src.opened:
		t.Fatal("a stream was opened for another host")
	default:
	}
}

func TestNoCrossOriginReadIsGiven(t *testing.T) {
	src := newSource()
	srv := httptest.NewServer(sseserver.NewHandler(src))
	t.Cleanup(srv.Close)
	req, _ := http.NewRequest("GET", srv.URL+"/events?size=60", nil)
	req.Header.Set("Origin", "http://evil.example")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })

	if v := resp.Header.Get("Access-Control-Allow-Origin"); v != "" {
		t.Fatalf("allows origin %q", v)
	}
}
