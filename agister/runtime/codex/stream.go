package codex

import (
	"encoding/json"
	"strings"
)

// event is what the wrapper reads of a JSON event line.
type event struct {
	Type     string `json:"type"`
	ThreadID string `json:"thread_id"`
	Item     struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"item"`
	Usage *struct {
		Input     *int64 `json:"input_tokens"`
		CacheRead *int64 `json:"cached_input_tokens"`
		Output    *int64 `json:"output_tokens"`
		Reasoning *int64 `json:"reasoning_output_tokens"`
	} `json:"usage"`
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

// stream is what a turn's JSON events told: the thread, the last agent
// message, whether the turn completed and its usage, and the message of a
// failed turn.
type stream struct {
	thread      string
	lastMessage string
	completed   bool
	usage       Usage
	failed      *string
}

// line reads one JSON event. A line that is not an event the wrapper reads
// is skipped, an error event among them: only turn.completed and
// turn.failed decide, and codex may report an error it then recovers from.
func (s *stream) line(line string) {
	var e event
	if err := json.Unmarshal([]byte(line), &e); err != nil {
		return
	}
	switch e.Type {
	case "thread.started":
		s.thread = e.ThreadID
	case "item.completed":
		if e.Item.Type == "agent_message" {
			s.lastMessage = e.Item.Text
		}
	case "turn.completed":
		s.completed = true
		if e.Usage != nil {
			s.usage = Usage{Input: e.Usage.Input, Output: e.Usage.Output, CacheRead: e.Usage.CacheRead, Reasoning: e.Usage.Reasoning}
		}
	case "turn.failed":
		s.failed = &e.Error.Message
	}
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

// class is a failed turn's class, by its message's words as the archive
// classed it: codex reports a failure as text alone, and none of these was
// observed live.
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
