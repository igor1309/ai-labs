// Package callreader answers which call Audelin is recording and what it
// said so far. It is the only part of the event source that knows the
// calls folder and transcript.md; it reads them and writes nothing.
package callreader

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Part is one stretch of speech as the transcript tells it: who spoke
// ("Me", "Them", "Them 2"), when in call time and the words.
type Part struct {
	// ID identifies the same part across reads of a call.
	ID      string
	Speaker string
	Start   time.Duration
	Words   string
}

// transcript is what a transcript.md tells: its origin, if any, and parts.
type transcript struct {
	origin     *origin
	parts      []Part
	incomplete bool
}

var errNotATranscript = errors.New("not a transcript as Audelin writes it")

var header = regexp.MustCompile(`^\*\*(Me|Them|Them [1-9][0-9]*|Gap)\*\* ([0-9]{2,}):([0-5][0-9]):([0-5][0-9])( \(filled in later\))?$`)

// parse reads a transcript as Audelin renders it. An unfinished last line
// is left for the next read; gaps and the speakers section are skipped.
func parse(text string) (transcript, error) {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	end := strings.LastIndexByte(text, '\n') + 1
	body, o, err := frontMatter(text[:end])
	if err != nil {
		return transcript{}, err
	}
	if !strings.HasPrefix(body, "# Transcript\n") {
		return transcript{}, errNotATranscript
	}
	t := transcript{origin: o, incomplete: end < len(text)}
	var label string
	var start time.Duration
	var lines []string
	closePart := func() {
		if label != "" && label != "Gap" {
			words := strings.TrimSpace(strings.Join(lines, "\n"))
			t.parts = append(t.parts, Part{Speaker: label, Start: start, Words: words})
		}
		label, lines = "", nil
	}
	for _, line := range strings.Split(strings.TrimPrefix(body, "# Transcript\n"), "\n") {
		if line == "## Speakers" {
			break
		}
		if m := header.FindStringSubmatch(line); m != nil {
			closePart()
			h, _ := strconv.Atoi(m[2])
			mi, _ := strconv.Atoi(m[3])
			s, _ := strconv.Atoi(m[4])
			label = m[1]
			start = time.Duration(h)*time.Hour + time.Duration(mi)*time.Minute + time.Duration(s)*time.Second
			continue
		}
		if label != "" {
			lines = append(lines, line)
		}
	}
	closePart()
	return t, nil
}
