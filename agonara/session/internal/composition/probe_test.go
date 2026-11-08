package composition

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
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
	}{{401, "shared", nil, true}, {200, "shared", nil, false}, {401, "", nil, false}, {0, "", errors.New("network"), false}} {
		spy := probeSpy(func(url string) (*http.Response, error) {
			if url != "http://127.0.0.1:8740/" {
				t.Fatal(url)
			}
			return &http.Response{StatusCode: tc.status, Header: http.Header{"X-Agonara-Session": []string{tc.identity}}, Body: io.NopCloser(strings.NewReader(""))}, tc.err
		})
		err := CheckRunning(Config{WebAddr: ":8740"}, spy)
		if (err == nil) != tc.ok {
			t.Fatalf("%+v %v", tc, err)
		}
	}
	if err := CheckRunning(Config{}, nil); err == nil {
		t.Fatal("missing HTTP probe")
	}
}
