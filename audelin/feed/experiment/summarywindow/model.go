package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// claudeCLI asks a model through `claude -p` with no tools, no settings
// and the experiment's own system prompt, and reads usage and cost from
// its JSON result. Latency is the API time the CLI reports.
type claudeCLI struct{ model string }

func (c claudeCLI) Ask(ctx context.Context, system, prompt string) (Reply, error) {
	cmd := exec.CommandContext(ctx, "claude", "-p", "--model", c.model, "--output-format", "json",
		"--tools", "", "--system-prompt", system, "--no-session-persistence",
		"--setting-sources", "", "--strict-mcp-config")
	cmd.Dir = os.TempDir()
	cmd.Stdin = strings.NewReader(prompt)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return Reply{}, fmt.Errorf("claude: %w: %s", err, stderr.String())
	}
	return parseCLI(out)
}

func parseCLI(out []byte) (Reply, error) {
	var r struct {
		Result   string  `json:"result"`
		IsError  bool    `json:"is_error"`
		Duration int64   `json:"duration_api_ms"`
		Cost     float64 `json:"total_cost_usd"`
		Usage    struct {
			Input       int `json:"input_tokens"`
			CacheCreate int `json:"cache_creation_input_tokens"`
			CacheRead   int `json:"cache_read_input_tokens"`
			Output      int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(out, &r); err != nil {
		return Reply{}, err
	}
	if r.IsError {
		return Reply{}, fmt.Errorf("claude: %s", r.Result)
	}
	return Reply{
		Text:         r.Result,
		InputTokens:  r.Usage.Input + r.Usage.CacheCreate + r.Usage.CacheRead,
		OutputTokens: r.Usage.Output,
		CostUSD:      r.Cost,
		Latency:      time.Duration(r.Duration) * time.Millisecond,
	}, nil
}
