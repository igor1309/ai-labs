// Package agonara reads Agonara's public API as one student, with a session
// cookie that is renewed once when it expires.
package agonara

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// Node is a navigation entry: a topic, concept or material.
type Node struct {
	EntityID     string `json:"entityId"`
	Title        string `json:"title"`
	AcceptedKind string `json:"acceptedKind"`
}

// Link is an outgoing relationship of an entity.
type Link struct {
	ToEntityID string `json:"toEntityId"`
	ToTitle    string `json:"toTitle"`
	ToKind     string `json:"toKind"`
}

// Entity is one navigation entity with its body and links.
type Entity struct {
	EntityID      string `json:"entityId"`
	Title         string `json:"title"`
	Body          string `json:"body"`
	AcceptedKind  string `json:"acceptedKind"`
	HasContent    bool   `json:"hasContent"`
	Relationships struct {
		Outgoing []Link `json:"outgoing"`
	} `json:"relationships"`
}

// Program is a program the student can see.
type Program struct {
	ProgramID string `json:"programId"`
	Title     string `json:"title"`
}

// Navigation is a program's top-level entries.
type Navigation struct {
	Topics             []Node `json:"topics"`
	UngroupedConcepts  []Node `json:"ungroupedConcepts"`
	UngroupedMaterials []Node `json:"ungroupedMaterials"`
}

// Client reads Agonara as one student.
type Client struct {
	root, origin, login, password string
	http                          *http.Client
	cookie                        string
}

// New returns a client; httpClient may be nil for a default one.
func New(baseURL, login, password string, httpClient *http.Client) (*Client, error) {
	if baseURL == "" || login == "" || password == "" {
		return nil, errors.New("agonara base URL, login and password are required")
	}
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	c := *httpClient
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{root: strings.TrimRight(baseURL, "/"), origin: baseURL, login: login, password: password, http: &c}, nil
}

// Response bodies and transport errors can contain credentials; report only the route.
func failure(method, route string, status any, reason string) error {
	return fmt.Errorf("%s %s failed (HTTP %v): %s", method, route, status, reason)
}

func (c *Client) request(ctx context.Context, method, route string, header http.Header, body []byte) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.root+route, bytes.NewReader(body))
	if err != nil {
		return nil, failure(method, route, "unavailable", "bad request")
	}
	req.Header = header
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, failure(method, route, "unavailable", "network error")
	}
	return resp, nil
}

func accepted(resp *http.Response, method, route string, out any) error {
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return failure(method, route, resp.StatusCode, "request rejected")
	}
	var envelope struct {
		Status string          `json:"status"`
		Value  json.RawMessage `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return failure(method, route, resp.StatusCode, "invalid JSON")
	}
	if envelope.Status != "accepted" {
		return failure(method, route, resp.StatusCode, "response not accepted")
	}
	if out != nil && json.Unmarshal(envelope.Value, out) != nil {
		return failure(method, route, resp.StatusCode, "invalid JSON")
	}
	return nil
}

func (c *Client) signIn(ctx context.Context) error {
	c.cookie = ""
	const route = "/identity/sessions"
	body, _ := json.Marshal(map[string]string{"login": c.login, "password": c.password})
	resp, err := c.request(ctx, "POST", route, http.Header{"Content-Type": {"application/json"}, "Origin": {c.origin}}, body)
	if err != nil {
		return err
	}
	cookies := resp.Header.Values("Set-Cookie")
	if err := accepted(resp, "POST", route, nil); err != nil {
		return err
	}
	parts := make([]string, 0, len(cookies))
	for _, value := range cookies {
		parts = append(parts, strings.SplitN(value, ";", 2)[0])
	}
	c.cookie = strings.Join(parts, "; ")
	if c.cookie == "" {
		return failure("POST", route, resp.StatusCode, "session cookie missing")
	}
	return nil
}

func (c *Client) read(ctx context.Context, route string, out any) error {
	if c.cookie == "" {
		if err := c.signIn(ctx); err != nil {
			return err
		}
	}
	resp, err := c.request(ctx, "GET", route, http.Header{"Cookie": {c.cookie}}, nil)
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		if err := c.signIn(ctx); err != nil {
			return err
		}
		if resp, err = c.request(ctx, "GET", route, http.Header{"Cookie": {c.cookie}}, nil); err != nil {
			return err
		}
	}
	return accepted(resp, "GET", route, out)
}

// ListPrograms returns every program the student can see.
func (c *Client) ListPrograms(ctx context.Context) ([]Program, error) {
	var v struct {
		Programs []Program `json:"programs"`
	}
	err := c.read(ctx, "/programs", &v)
	return v.Programs, err
}

// Navigation returns a program's topics and ungrouped entries.
func (c *Client) Navigation(ctx context.Context, programID string) (Navigation, error) {
	var v struct {
		Navigation Navigation `json:"navigation"`
	}
	err := c.read(ctx, "/programs/"+url.PathEscape(programID)+"/navigation", &v)
	return v.Navigation, err
}

// Entity returns one entity with its body and outgoing links.
func (c *Client) Entity(ctx context.Context, entityID string) (Entity, error) {
	var v struct {
		NavigationNode Entity `json:"navigationNode"`
	}
	err := c.read(ctx, "/navigation/entities/"+url.PathEscape(entityID), &v)
	return v.NavigationNode, err
}

// MaterialContent returns a material's text as markdown.
func (c *Client) MaterialContent(ctx context.Context, entityID string) (string, error) {
	var v struct {
		Content string `json:"content"`
	}
	err := c.read(ctx, "/materials/"+url.PathEscape(entityID)+"/content", &v)
	return v.Content, err
}
