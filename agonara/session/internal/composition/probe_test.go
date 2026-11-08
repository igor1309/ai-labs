package composition

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
)

type probeSpy func(string) (*http.Response, error)

func (p probeSpy) Get(url string) (*http.Response, error) { return p(url) }
func TestStartupProbeChecksGuardAndOwnerIdentityWithoutCredentials(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		status   int
		identity string
		err      error
		ok       bool
	}{{401, "shared", nil, true}, {200, "shared", nil, false}, {401, "standalone", nil, false}, {401, "", nil, false}, {0, "", errors.New("network"), false}} {
		spy := probeSpy(func(url string) (*http.Response, error) {
			if url != "http://127.0.0.1:8740/" {
				t.Fatal(url)
			}
			return &http.Response{StatusCode: tc.status, Header: http.Header{"X-Agonara-Session": []string{tc.identity}}, Body: io.NopCloser(strings.NewReader(""))}, tc.err
		})
		err := CheckRunning(Config{WebAddr: ":8740"}, false, spy)
		if (err == nil) != tc.ok {
			t.Fatalf("%+v %v", tc, err)
		}
	}
	if err := CheckRunning(Config{}, false, nil); err == nil {
		t.Fatal("missing HTTP probe")
	}
}

// Integration test: readiness probes the assembled handler through a controlled transport at the expected address.
func TestCombinedReadinessRejectsStandaloneOccupyingItsAddress(t *testing.T) {
	t.Parallel()
	for _, standalone := range []bool{false, true} {
		c := Config{PageSize: 1000, WebToken: "guard", WebAddr: ":8740", ChatID: 17}
		a, err := Assemble(context.Background(), c, true, Dependencies{Content: readingSpy{}, Reading: &memoryStorage{state: flow.InitialState()}, Log: func(string) {}})
		if err != nil {
			t.Fatal(err)
		}
		transport := probeSpy(func(url string) (*http.Response, error) {
			if url != "http://127.0.0.1:8740/" {
				t.Errorf("probe %s", url)
			}
			recorder := httptest.NewRecorder()
			a.Handler.ServeHTTP(recorder, httptest.NewRequest("GET", url, nil))
			return recorder.Result(), nil
		})
		err = CheckRunning(c, standalone, transport)
		if (err == nil) != standalone {
			t.Fatalf("standalone probe=%v err=%v", standalone, err)
		}
	}
}
