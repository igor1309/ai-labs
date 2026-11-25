package main

import (
	"fmt"
	"io"
	"slices"
	"strings"
)

// writeReport prints one Markdown table per call: what each strategy
// cost and what its summaries missed.
func writeReport(w io.Writer, runs []Run) {
	var total float64
	fixture := ""
	for _, r := range runs {
		if r.Fixture != fixture {
			fixture = r.Fixture
			fmt.Fprintf(w, "\n### %s\n\n", fixture)
			fmt.Fprintln(w, "| Strategy | Calls | Input tokens | Largest input | Output tokens | Cost USD | Median latency s | Last latency s | Missed at end | Fact-steps missed |")
			fmt.Fprintln(w, "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |")
		}
		m := measure(r)
		total += m.cost
		missed := strings.Join(m.missedAtEnd, ", ")
		if missed == "" {
			missed = "none"
		}
		fmt.Fprintf(w, "| %s | %d | %d | %d | %d | %.4f | %.1f | %.1f | %s | %d/%d |\n",
			r.Strategy, len(r.Steps), m.input, m.largest, m.output, m.cost, m.median, m.last, missed, m.factStepsMissed, m.factSteps)
	}
	fmt.Fprintf(w, "\nTotal reported cost: %.4f USD\n", total)
}

type measures struct {
	input, largest, output     int
	cost, median, last         float64
	missedAtEnd                []string
	factSteps, factStepsMissed int
}

func measure(r Run) measures {
	var m measures
	var latencies []float64
	for _, s := range r.Steps {
		m.input += s.InputTokens
		m.largest = max(m.largest, s.InputTokens)
		m.output += s.OutputTokens
		m.cost += s.CostUSD
		latencies = append(latencies, float64(s.LatencyMS)/1000)
		m.factSteps += len(s.Kept) + len(s.Missing)
		m.factStepsMissed += len(s.Missing)
	}
	if len(latencies) > 0 {
		m.last = latencies[len(latencies)-1]
		slices.Sort(latencies)
		m.median = latencies[len(latencies)/2]
		m.missedAtEnd = r.Steps[len(r.Steps)-1].Missing
	}
	return m
}
