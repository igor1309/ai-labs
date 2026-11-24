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
	// ID identifies the source segment across reads of a call.
	ID      string
	Speaker string
	Start   time.Duration
	Words   string
}

// transcript is what a transcript.md tells: its origin, if any, and parts.
type transcript struct {
	origin *origin
	parts  []Part
}

var errNotATranscript = errors.New("not a transcript as Audelin writes it")

var header = regexp.MustCompile(`^\*\*(Me|Them|Them [1-9][0-9]*|Gap)\*\* ([0-9]{2,}):([0-5][0-9]):([0-5][0-9])(?: \(filled in later\))?(?: <!-- audelin-segment ((me|them)-(-?[0-9]+)) -->)?$`)

func track(label string) string {
	if label == "Me" {
		return "me"
	}
	return "them"
}

func rowHeader(line string) []string {
	m := header.FindStringSubmatch(line)
	if m != nil && m[5] != "" {
		if _, err := strconv.ParseInt(m[7], 10, 64); err != nil || m[1] == "Gap" || m[6] != track(m[1]) {
			return nil
		}
	}
	return m
}

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
	t := transcript{origin: o}
	type second struct {
		track string
		start time.Duration
	}
	legacyRows := make(map[second]int)
	var label, id string
	var start time.Duration
	var lines []string
	closePart := func() {
		if label != "" && label != "Gap" {
			partID := id
			if partID == "" {
				key := second{track(label), start}
				row := legacyRows[key]
				legacyRows[key]++
				partID = "legacy/" + key.track + "/" + strconv.FormatInt(int64(start/time.Second), 10) + "/" + strconv.Itoa(row)
			}
			words := strings.TrimSpace(strings.Join(lines, "\n"))
			if words != "" {
				t.parts = append(t.parts, Part{ID: partID, Speaker: label, Start: start, Words: words})
			}
		}
		label, lines = "", nil
	}
	for _, line := range strings.Split(strings.TrimPrefix(body, "# Transcript\n"), "\n") {
		if line == "## Speakers" {
			break
		}
		if m := rowHeader(line); m != nil {
			closePart()
			h, _ := strconv.Atoi(m[2])
			mi, _ := strconv.Atoi(m[3])
			s, _ := strconv.Atoi(m[4])
			label = m[1]
			start = time.Duration(h)*time.Hour + time.Duration(mi)*time.Minute + time.Duration(s)*time.Second
			id = m[5]
			continue
		}
		if label != "" {
			if strings.HasPrefix(line, "\\") {
				content := strings.TrimLeft(line, "\\")
				if m := rowHeader(content); (m != nil && (id != "" || m[5] != "")) || (id != "" && content == "## Speakers") {
					line = line[1:]
				}
			}
			lines = append(lines, line)
		}
	}
	closePart()
	return t, nil
}
