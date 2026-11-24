// Package callreader answers which call Audelin is recording and what it
// said so far. It is the only part of the event source that knows the
// calls folder and transcript.md; it reads them and writes nothing.
package callreader

import (
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Part is one stretch of speech as the transcript tells it: who spoke
// ("Me", "Them", "Them 2"), when in call time and the words.
type Part struct {
	Speaker string
	Start   time.Duration
	Words   string
}

// transcript is what a transcript.md tells: its origin, if any, and parts.
type transcript struct {
	origin *origin
	parts  []Part
}

type release struct {
	Version string `json:"version"`
	Build   string `json:"build"`
}

type callOrigin struct {
	Hearing  *release        `json:"hearing"`
	Split    json.RawMessage `json:"split"`
	Cleaning json.RawMessage `json:"cleaning"`
}

type originalCall struct {
	Start  float64     `json:"start"`
	Origin *callOrigin `json:"origin"`
}

type origin struct {
	Calls    []originalCall `json:"calls"`
	MergedBy *release       `json:"mergedBy"`
}

var errNotATranscript = errors.New("not a transcript as Audelin writes it")

var header = regexp.MustCompile(`^\*\*(Me|Them|Them [1-9][0-9]*|Gap)\*\* ([0-9]{2,}):([0-5][0-9]):([0-5][0-9])( \(filled in later\))?$`)

// parse reads a transcript as Audelin renders it. An unfinished last line
// is left for the next read; gaps and the speakers section are skipped.
func parse(text string) (transcript, error) {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	if i := strings.LastIndexByte(text, '\n'); i >= 0 {
		text = text[:i+1]
	} else {
		text = ""
	}
	body, o := frontMatter(text)
	if !strings.HasPrefix(body, "# Transcript\n") {
		return transcript{}, errNotATranscript
	}
	t := transcript{origin: o}
	var label string
	var start time.Duration
	var lines []string
	closePart := func() {
		words := strings.TrimSpace(strings.Join(lines, "\n"))
		if label != "" && label != "Gap" && words != "" {
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

// frontMatter splits off the origin block above the transcript, as
// Audelin reads it: a broken or unknown block tells no origin.
func frontMatter(text string) (string, *origin) {
	if !strings.HasPrefix(text, "---\n") {
		return text, nil
	}
	rest := text[4:]
	searched := rest
	if strings.HasPrefix(rest, "# Transcript\n") {
		searched = ""
	} else if h := strings.Index(rest, "\n# Transcript\n"); h >= 0 {
		searched = rest[:h+len("\n# Transcript\n")]
	}
	end := strings.Index(searched, "\n---\n")
	if end < 0 {
		if strings.HasPrefix(rest, "# Transcript\n") {
			return rest, nil
		}
		if h := strings.Index(rest, "\n# Transcript\n"); h >= 0 {
			return rest[h+1:], nil
		}
		return "", nil
	}
	body := strings.TrimLeft(rest[end+len("\n---\n"):], "\n")
	var block struct {
		SchemaVersion int     `json:"schemaVersion"`
		Origin        *origin `json:"origin"`
	}
	if json.Unmarshal([]byte(rest[:end]), &block) != nil || block.SchemaVersion != 1 {
		return body, nil
	}
	return body, block.Origin
}
