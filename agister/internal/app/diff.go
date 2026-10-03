package app

import (
	"fmt"
	"strings"
)

// diffContext is how many unchanged lines a hunk shows around a change.
const diffContext = 3

// diffCells bounds the table a diff compares lines in; beyond it the
// changed middle is shown as removed, then added.
const diffCells = 1 << 20

type diffLine struct {
	op   byte // ' ', '-' or '+'
	text string
}

// unifiedDiff is the unified diff from a, labelled from, to b, labelled to.
func unifiedDiff(from, to string, a, b []byte) string {
	lines := diffLines(splitLines(string(a)), splitLines(string(b)))
	// Where each line of the script falls in a and in b.
	oldAt, newAt := make([]int, len(lines)+1), make([]int, len(lines)+1)
	for k, line := range lines {
		oldAt[k+1], newAt[k+1] = oldAt[k], newAt[k]
		if line.op != '+' {
			oldAt[k+1]++
		}
		if line.op != '-' {
			newAt[k+1]++
		}
	}
	var out strings.Builder
	fmt.Fprintf(&out, "--- %s\n+++ %s\n", from, to)
	for k := 0; k < len(lines); {
		for k < len(lines) && lines[k].op == ' ' {
			k++
		}
		if k == len(lines) {
			break
		}
		// A hunk runs from its first change to its last, joining changes
		// whose context would meet.
		last := k
		for next := k + 1; next < len(lines); next++ {
			if lines[next].op == ' ' {
				continue
			}
			if next-last-1 > 2*diffContext {
				break
			}
			last = next
		}
		start, stop := max(0, k-diffContext), min(len(lines), last+diffContext+1)
		oldCount, newCount := oldAt[stop]-oldAt[start], newAt[stop]-newAt[start]
		fmt.Fprintf(&out, "@@ -%s +%s @@\n", hunkRange(oldAt[start], oldCount), hunkRange(newAt[start], newCount))
		for _, line := range lines[start:stop] {
			out.WriteByte(line.op)
			out.WriteString(line.text)
			if !strings.HasSuffix(line.text, "\n") {
				out.WriteString("\n\\ No newline at end of file\n")
			}
		}
		k = stop
	}
	return out.String()
}

func hunkRange(before, count int) string {
	if count == 0 {
		return fmt.Sprintf("%d,0", before)
	}
	if count == 1 {
		return fmt.Sprintf("%d", before+1)
	}
	return fmt.Sprintf("%d,%d", before+1, count)
}

// splitLines splits text into lines, each with its newline; the last may
// have none.
func splitLines(text string) []string {
	lines := strings.SplitAfter(text, "\n")
	if lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// diffLines is the script that turns a into b, keeping their longest
// common run of lines.
func diffLines(a, b []string) []diffLine {
	var head, tail []diffLine
	for len(a) > 0 && len(b) > 0 && a[0] == b[0] {
		head = append(head, diffLine{' ', a[0]})
		a, b = a[1:], b[1:]
	}
	for len(a) > 0 && len(b) > 0 && a[len(a)-1] == b[len(b)-1] {
		tail = append([]diffLine{{' ', a[len(a)-1]}}, tail...)
		a, b = a[:len(a)-1], b[:len(b)-1]
	}
	script := head
	n, m := len(a), len(b)
	if n*m > diffCells {
		for _, line := range a {
			script = append(script, diffLine{'-', line})
		}
		for _, line := range b {
			script = append(script, diffLine{'+', line})
		}
		return append(script, tail...)
	}
	// common[i*(m+1)+j] is the longest common run of a[i:] and b[j:].
	common := make([]int32, (n+1)*(m+1))
	at := func(i, j int) int32 { return common[i*(m+1)+j] }
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				common[i*(m+1)+j] = at(i+1, j+1) + 1
			} else {
				common[i*(m+1)+j] = max(at(i+1, j), at(i, j+1))
			}
		}
	}
	i, j := 0, 0
	for i < n && j < m {
		switch {
		case a[i] == b[j]:
			script = append(script, diffLine{' ', a[i]})
			i, j = i+1, j+1
		case at(i+1, j) >= at(i, j+1):
			script = append(script, diffLine{'-', a[i]})
			i++
		default:
			script = append(script, diffLine{'+', b[j]})
			j++
		}
	}
	for ; i < n; i++ {
		script = append(script, diffLine{'-', a[i]})
	}
	for ; j < m; j++ {
		script = append(script, diffLine{'+', b[j]})
	}
	return append(script, tail...)
}
