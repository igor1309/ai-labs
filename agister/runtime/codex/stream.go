package codex

import (
	"bytes"
	"encoding/json"
	"strings"
)

// event is what the wrapper reads of a JSON event line.
type event struct {
	Type     string `json:"type"`
	ThreadID string `json:"thread_id"`
	Item     item   `json:"item"`
	Usage    *struct {
		Input     *int64 `json:"input_tokens"`
		CacheRead *int64 `json:"cached_input_tokens"`
		Output    *int64 `json:"output_tokens"`
		Reasoning *int64 `json:"reasoning_output_tokens"`
	} `json:"usage"`
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

// item is what the wrapper reads of an event's item: its id and type, an
// agent message's text, and what a tool call was given, by the fields
// codex gives each kind of call.
type item struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	Command   string          `json:"command"`
	Query     string          `json:"query"`
	Action    json.RawMessage `json:"action"`
	Changes   json.RawMessage `json:"changes"`
	Server    string          `json:"server"`
	Tool      string          `json:"tool"`
	Arguments json.RawMessage `json:"arguments"`
}

// stream is what a turn's JSON events told: the thread, the last agent
// message, whether the turn completed and its usage, and the message of a
// failed turn; the report each line is given to, and the searches
// reported as they started.
type stream struct {
	report      func(Report)
	searches    map[string]bool
	thread      string
	lastMessage string
	completed   bool
	usage       Usage
	failed      *string
}

// line reads one JSON event, and reports the tool call it makes, then the
// tool's result it gives, or the line where it gives neither. A line that
// is not an event the wrapper reads tells nothing more, an error event
// among them: only turn.completed and turn.failed decide, and codex may
// report an error it then recovers from.
func (s *stream) line(line string) {
	tool, result := s.read(line)
	if tool != nil || !result {
		s.report(Report{Tool: tool})
	}
	if result {
		s.report(Report{Result: true})
	}
}

// read reads one JSON event, and gives the tool call it makes, nil for
// none, and whether it is a tool's result: the completion of a tool item
// the wrapper reports.
func (s *stream) read(line string) (tool *Tool, result bool) {
	var e event
	if err := json.Unmarshal([]byte(line), &e); err != nil {
		return nil, false
	}
	switch e.Type {
	case "thread.started":
		s.thread = e.ThreadID
	case "item.started":
		return s.started(e.Item), false
	case "item.completed":
		switch e.Item.Type {
		case "agent_message":
			s.lastMessage = e.Item.Text
		case "command_execution", "file_change", "mcp_tool_call":
			result = true
		case "web_search":
			// A search not reported as it started is reported here, by
			// what its completed item gives, as called and done at once.
			if !s.searches[e.Item.ID] {
				tool = &Tool{Name: "web_search", Input: search(e.Item)}
			}
			delete(s.searches, e.Item.ID)
			result = true
		}
	case "turn.completed":
		s.completed = true
		if e.Usage != nil {
			s.usage = Usage{Input: e.Usage.Input, Output: e.Usage.Output, CacheRead: e.Usage.CacheRead, Reasoning: e.Usage.Reasoning}
		}
	case "turn.failed":
		s.failed = &e.Error.Message
	}
	return tool, result
}

// started is the tool call an item starts, where it is one the wrapper
// recognizes, as the archive printed it; nil for none. A search that
// starts without its query is no call to tell from another: it is
// reported as it completes.
func (s *stream) started(item item) *Tool {
	switch item.Type {
	case "command_execution":
		return &Tool{Name: "command", Input: item.Command}
	case "file_change":
		return &Tool{Name: "file_change", Input: text(item.Changes)}
	case "mcp_tool_call":
		return &Tool{Name: "mcp:" + item.Server + "/" + item.Tool, Input: text(item.Arguments)}
	case "web_search":
		if item.Query != "" {
			s.searches[item.ID] = true
			return &Tool{Name: "web_search", Input: item.Query}
		}
	}
	return nil
}

// search is what a completed search was given: its query, then its action
// where that says more than a search for the query, as an opened page
// does.
func search(item item) string {
	var action map[string]any
	if json.Unmarshal(item.Action, &action) != nil || action == nil ||
		len(action) == 2 && action["type"] == "search" && action["query"] == item.Query {
		return item.Query
	}
	return strings.TrimSpace(item.Query + " " + text(item.Action))
}

// text is raw JSON as text: a string's value, else the JSON on one line,
// "" where there is none.
func text(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var b bytes.Buffer
	if json.Compact(&b, raw) != nil {
		return string(raw)
	}
	return b.String()
}

// reply is the turn's reply, its program having ended as ended and a schema
// given or not: a failed turn's, else a completed one's, else how the
// program exited.
func (s *stream) reply(ended Ended, schema bool) *Reply {
	reply := &Reply{Text: s.lastMessage, Session: s.thread}
	switch {
	case s.failed != nil:
		reply.Failure, reply.Reason = class(*s.failed), *s.failed
	case s.completed:
		reply.Usage = s.usage
		if schema {
			reply.Output, reply.Failure, reply.Reason = output(s.lastMessage)
		}
	case ended.Code != 0:
		reply.Failure, reply.Reason = RuntimeError, strings.TrimSpace(ended.Stderr.Tail)
	default:
		reply.Failure = NoResult
	}
	return reply
}

// output is the structured output a completed turn's last message gives,
// or why it gives none.
func output(message string) ([]byte, Class, string) {
	trimmed := strings.TrimSpace(message)
	switch {
	case trimmed == "":
		return nil, InvalidOutput, "no structured output"
	case !json.Valid([]byte(trimmed)):
		return nil, InvalidOutput, "the structured output is not JSON"
	}
	return []byte(trimmed), "", ""
}

// class is a failed turn's class, by its message's words: codex reports
// a failure as text alone.
func class(message string) Class {
	words := strings.ToLower(message)
	has := func(found ...string) bool {
		for _, word := range found {
			if strings.Contains(words, word) {
				return true
			}
		}
		return false
	}
	switch {
	case has("rate limit", "usage limit", "429"):
		return RateLimited
	case has("unauthorized", "401", "login"):
		return Auth
	case has("context window", "context length"):
		return ContextOverflow
	}
	return RuntimeError
}
