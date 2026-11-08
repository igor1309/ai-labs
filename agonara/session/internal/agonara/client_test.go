package agonara

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

const (
	login    = "student"
	password = "private-password"
	cookie   = "session=private-cookie"
)

type reply struct {
	status int
	body   string
	cookie string
}

func ok(value string) reply {
	return reply{200, `{"status":"accepted","value":` + value + `}`, ""}
}

func signedIn(value string) reply { r := ok("{}"); r.cookie = value; return r }

type seen struct{ method, path, cookie, origin, body string }

func serve(t *testing.T, replies ...reply) (*Client, *[]seen) {
	t.Helper()
	var requests []seen
	transport := roundTrip(func(r *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(r.Body)
		requests = append(requests, seen{r.Method, r.URL.EscapedPath(), r.Header.Get("Cookie"), r.Header.Get("Origin"), string(body)})
		if len(replies) == 0 {
			t.Errorf("unexpected request %s %s", r.Method, r.URL)
			return nil, errors.New("unexpected request")
		}
		next := replies[0]
		replies = replies[1:]
		header := http.Header{}
		if next.cookie != "" {
			header.Add("Set-Cookie", next.cookie+"; Path=/; HttpOnly; Secure")
		}
		return &http.Response{StatusCode: next.status, Header: header, Body: io.NopCloser(strings.NewReader(next.body)), Request: r}, nil
	})
	client, err := New("https://content.example/", login, password, &http.Client{Transport: transport})
	if err != nil {
		t.Fatal(err)
	}
	return client, &requests
}

// Contract test: the public HTTP protocol through an injected transport, including authentication and failures.
func TestSignsInAndReadsEachRoute(t *testing.T) {
	t.Parallel()
	client, requests := serve(t, signedIn(cookie),
		ok(`{"programs":[{"programId":"p","title":"Program"}]}`),
		ok(`{"navigation":{"topics":[{"entityId":"t","title":"T","acceptedKind":"topic"}]}}`),
		ok(`{"navigationNode":{"title":"Entity","hasContent":true}}`),
		ok(`{"content":"# Text"}`))
	ctx := context.Background()
	programs, err := client.ListPrograms(ctx)
	if err != nil || len(programs) != 1 || programs[0].Title != "Program" {
		t.Fatal(programs, err)
	}
	navigation, _ := client.Navigation(ctx, "p/id")
	entity, _ := client.Entity(ctx, "e/id")
	content, _ := client.MaterialContent(ctx, "m")
	if navigation.Topics[0].Title != "T" || entity.Title != "Entity" || !entity.HasContent || content != "# Text" {
		t.Fatal(navigation, entity, content)
	}
	var credentials map[string]string
	_ = json.Unmarshal([]byte((*requests)[0].body), &credentials)
	first := (*requests)[0]
	if first.method != "POST" || first.path != "/identity/sessions" || credentials["login"] != login || first.origin == "" {
		t.Fatal(first)
	}
	for index, path := range []string{"/programs", "/programs/p%2Fid/navigation", "/navigation/entities/e%2Fid", "/materials/m/content"} {
		got := (*requests)[index+1]
		if got.method != "GET" || got.path != path || got.cookie != cookie {
			t.Fatalf("request %d: %+v", index+1, got)
		}
	}
}

// Contract test: the public HTTP protocol through an injected transport, including authentication and failures.
func TestA401SignsInOnceAgain(t *testing.T) {
	t.Parallel()
	client, requests := serve(t, signedIn(cookie), reply{401, "{}", ""}, signedIn("session=new"), ok(`{"programs":[]}`))
	if _, err := client.ListPrograms(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(*requests) != 4 || (*requests)[3].cookie != "session=new" {
		t.Fatal(*requests)
	}
}

// Contract test: the public HTTP protocol through an injected transport, including authentication and failures.
func TestErrorsNameTheRouteNotTheSecrets(t *testing.T) {
	t.Parallel()
	leak := `{"password":"` + password + `","cookie":"` + cookie + `"}`
	for name, c := range map[string]struct {
		replies []reply
		route   string
		status  string
	}{
		"second 401":        {[]reply{signedIn(cookie), {401, leak, ""}, signedIn(cookie), {401, leak, ""}}, "GET /programs", "401"},
		"sign-in rejection": {[]reply{{403, leak, ""}}, "POST /identity/sessions", "403"},
		"non-accepted":      {[]reply{{200, `{"status":"rejected"}`, ""}}, "POST /identity/sessions", "200"},
		"missing cookie":    {[]reply{ok("{}")}, "POST /identity/sessions", "200"},
		"read rejection":    {[]reply{signedIn(cookie), {503, leak, ""}}, "GET /programs", "503"},
		"invalid JSON":      {[]reply{signedIn(cookie), {200, password, ""}}, "GET /programs", "200"},
		"non-accepted read": {[]reply{signedIn(cookie), {200, `{"status":"rejected"}`, ""}}, "GET /programs", "200"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			client, _ := serve(t, c.replies...)
			_, err := client.ListPrograms(context.Background())
			if err == nil {
				t.Fatal("want error")
			}
			message := err.Error()
			if !strings.Contains(message, c.route) || !strings.Contains(message, "HTTP "+c.status) ||
				strings.Contains(message, password) || strings.Contains(message, cookie) {
				t.Fatal(message)
			}
		})
	}
}

// Contract test: the public HTTP protocol through an injected transport, including authentication and failures.
func TestNetworkFailureSaysUnavailable(t *testing.T) {
	t.Parallel()
	client, err := New("https://content.example", login, password, &http.Client{Transport: roundTrip(func(*http.Request) (*http.Response, error) { return nil, errors.New("offline") })})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.ListPrograms(context.Background())
	if err == nil || err.Error() != "POST /identity/sessions failed (HTTP unavailable): network error" {
		t.Fatal(err)
	}
}

func TestRequiresCredentials(t *testing.T) {
	t.Parallel()
	if _, err := New("", login, password, nil); err == nil {
		t.Fatal("want error")
	}
}

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
