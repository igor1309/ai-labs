package callreader

import (
	"encoding/json"
	"strings"
)

type release struct {
	Version *string `json:"version"`
	Build   *string `json:"build"`
}

func (r *release) valid() bool { return r != nil && r.Version != nil && r.Build != nil }

type split map[string]struct {
	Release  *release `json:"release"`
	Diarizer *string  `json:"diarizer"`
}

func (s split) valid() bool {
	// The renderer encodes a split as a single enum case with its payload.
	if len(s) != 1 {
		return false
	}
	for outcome, details := range s {
		if !details.Release.valid() {
			return false
		}
		switch outcome {
		case "done":
			return details.Diarizer != nil
		case "nothingKept", "skipped":
			return true
		}
	}
	return false
}

type cleaning struct {
	Outcome string   `json:"outcome"`
	Release *release `json:"release"`
}

func (c *cleaning) valid() bool {
	switch c.Outcome {
	case "done", "nothingKept", "skipped":
		return c.Release.valid()
	}
	return false
}

type callOrigin struct {
	Hearing  *release  `json:"hearing"`
	Mine     *string   `json:"mine"`
	Theirs   *string   `json:"theirs"`
	Split    split     `json:"split"`
	Cleaning *cleaning `json:"cleaning"`
}

func (c *callOrigin) valid() bool {
	return c.Hearing.valid() && c.Mine != nil && c.Theirs != nil &&
		(c.Split == nil || c.Split.valid()) && (c.Cleaning == nil || c.Cleaning.valid())
}

func (c *callOrigin) finishing() bool { return c.Split != nil || c.Cleaning != nil }

type originalCall struct {
	Start  *float64    `json:"start"`
	Origin *callOrigin `json:"origin"`
}

type origin struct {
	Calls    []originalCall `json:"calls"`
	MergedBy *release       `json:"mergedBy"`
}

func (o *origin) valid() bool {
	if o == nil || o.Calls == nil || (o.MergedBy != nil && !o.MergedBy.valid()) {
		return false
	}
	for _, call := range o.Calls {
		if call.Start == nil || (call.Origin != nil && !call.Origin.valid()) {
			return false
		}
	}
	return true
}

// frontMatter separates the optional origin block from the transcript.
func frontMatter(text string) (string, *origin, error) {
	rest, present := strings.CutPrefix(text, "---\n")
	if !present {
		return text, nil, nil
	}
	metadata, body, closed := strings.Cut(rest, "\n---\n")
	var block struct {
		SchemaVersion int     `json:"schemaVersion"`
		Origin        *origin `json:"origin"`
	}
	if !closed || json.Unmarshal([]byte(metadata), &block) != nil || block.SchemaVersion != 1 || !block.Origin.valid() {
		return "", nil, errNotATranscript
	}
	return strings.TrimLeft(body, "\n"), block.Origin, nil
}
