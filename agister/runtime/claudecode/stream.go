package claudecode

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// event is what the wrapper reads of a stream-json line.
type event struct {
	Type      string `json:"type"`
	Subtype   string `json:"subtype"`
	SessionID string `json:"session_id"`
	Message   struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"message"`
	RateLimitInfo struct {
		Status string `json:"status"`
	} `json:"rate_limit_info"`
	IsError          bool            `json:"is_error"`
	Result           string          `json:"result"`
	StructuredOutput json.RawMessage `json:"structured_output"`
	TotalCostUSD     *float64        `json:"total_cost_usd"`
	APIErrorStatus   *int            `json:"api_error_status"`
	Errors           []any           `json:"errors"`
	Usage            *struct {
		Input      *int64 `json:"input_tokens"`
		Output     *int64 `json:"output_tokens"`
		CacheRead  *int64 `json:"cache_read_input_tokens"`
		CacheWrite *int64 `json:"cache_creation_input_tokens"`
	} `json:"usage"`
}

// stream is what a turn's stream-json lines told: the session, the last
// assistant text, whether a rate limit was rejected, and the result event.
type stream struct {
	session  string
	lastText string
	rejected bool
	result   *event
}

// line reads one line of stream-json. A line that is not an event the
// wrapper reads is skipped: the result event decides, and what precedes it
// only adds to it.
func (s *stream) line(line string) {
	var e event
	if err := json.Unmarshal([]byte(line), &e); err != nil {
		return
	}
	switch e.Type {
	case "system":
		if e.Subtype == "init" {
			s.session = e.SessionID
		}
	case "assistant":
		for _, block := range e.Message.Content {
			if block.Type == "text" && strings.TrimSpace(block.Text) != "" {
				s.lastText = block.Text
			}
		}
	case "rate_limit_event":
		if e.RateLimitInfo.Status == "rejected" {
			s.rejected = true
		}
	case "result":
		s.result = &e
		if s.session == "" {
			s.session = e.SessionID
		}
	}
}

// reply is the turn's reply, its program having ended as ended and a schema
// given or not: the result event's, else how the program exited.
func (s *stream) reply(ended Ended, schema bool) *Reply {
	reply := &Reply{Text: s.lastText, Session: s.session}
	r := s.result
	if r == nil {
		if ended.Code != 0 {
			reply.Failure, reply.Reason = RuntimeError, strings.TrimSpace(ended.Stderr.Tail)
		} else {
			reply.Failure = NoResult
		}
		return reply
	}
	if r.Result != "" {
		reply.Text = r.Result
	}
	if output := bytes.TrimSpace(r.StructuredOutput); len(output) > 0 && !bytes.Equal(output, []byte("null")) {
		reply.Output = output
	}
	reply.Cost = r.TotalCostUSD
	if r.Usage != nil {
		reply.Usage = Usage{Input: r.Usage.Input, Output: r.Usage.Output, CacheRead: r.Usage.CacheRead, CacheWrite: r.Usage.CacheWrite}
	}
	switch {
	case r.Subtype != "success" || r.IsError:
		reply.Failure, reply.Reason = s.class(r), reason(r)
	case schema && reply.Output == nil:
		reply.Failure, reply.Reason = InvalidOutput, "no structured output"
	}
	return reply
}

// class is a failed result's class, by its fields: its status and a
// rejected rate limit where claude-code reports them, else its words,
// since a failure before any request, such as no login, has no status.
func (s *stream) class(r *event) Class {
	status := 0
	if r.APIErrorStatus != nil {
		status = *r.APIErrorStatus
	}
	words := strings.ToLower(reason(r))
	switch {
	case status == 429 || s.rejected:
		return RateLimited
	case status == 401 || status == 403 || strings.Contains(strings.ToLower(r.Result), "not logged in"):
		return Auth
	case status == 413 || strings.Contains(words, "prompt is too long") || strings.Contains(words, "context window"):
		return ContextOverflow
	}
	return RuntimeError
}

// reason is a failed result's errors, joined by "; ", else its text.
func reason(r *event) string {
	if len(r.Errors) == 0 {
		return r.Result
	}
	words := make([]string, len(r.Errors))
	for i, e := range r.Errors {
		words[i] = fmt.Sprint(e)
	}
	return strings.Join(words, "; ")
}
