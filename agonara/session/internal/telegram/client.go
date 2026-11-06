package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// Error is a Bot API refusal; Code 409 means another poller holds the token.
type Error struct {
	Method      string
	Code        int
	Description string
}

func (e *Error) Error() string {
	return fmt.Sprintf("%s failed: %d %s", e.Method, e.Code, e.Description)
}

// Client calls the Bot API over HTTPS.
type Client struct {
	Token string
	HTTP  *http.Client
	Base  string
}

// Call posts one method and returns its result.
func (c Client) Call(ctx context.Context, method string, params map[string]any) (json.RawMessage, error) {
	base := c.Base
	if base == "" {
		base = "https://api.telegram.org"
	}
	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	if params == nil {
		params = map[string]any{}
	}
	body, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", base+"/bot"+c.Token+"/"+method, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("%s failed: bad request", method)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		// The URL holds the token; never report it.
		return nil, fmt.Errorf("%s failed: network error", method)
	}
	defer resp.Body.Close()
	var envelope struct {
		OK          bool            `json:"ok"`
		Result      json.RawMessage `json:"result"`
		ErrorCode   int             `json:"error_code"`
		Description string          `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return nil, fmt.Errorf("%s failed: invalid JSON (HTTP %d)", method, resp.StatusCode)
	}
	if !envelope.OK {
		return nil, &Error{Method: method, Code: envelope.ErrorCode, Description: envelope.Description}
	}
	return envelope.Result, nil
}
