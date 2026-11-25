package callreader

import (
	"strconv"
	"time"
)

// partIDs tracks rows on each recording side. The transcript gives neither
// the recognizer's IDs nor the boundary between final and pending rows.
type partIDs struct {
	previous [2][]*Part
	next     uint64
}

func (ids *partIDs) assign(rows []Part, incomplete bool) []Part {
	var tracks [2][]*Part
	for i := range rows {
		side := 0
		if rows[i].Speaker != "Me" {
			side = 1
		}
		tracks[side] = append(tracks[side], &rows[i])
	}
	for side, track := range tracks {
		ids.previous[side] = matchRows(ids.previous[side], track, incomplete)
	}

	var parts []Part
	for i := range rows {
		row := &rows[i]
		if row.ID == "" {
			ids.next++
			row.ID = strconv.FormatUint(ids.next, 10)
		}
		if row.Words != "" {
			parts = append(parts, *row)
		}
	}
	return parts
}

type rowKey struct {
	start time.Duration
	words string
}

func key(row *Part) rowKey { return rowKey{row.Start, row.Words} }

func matchRows(previous, current []*Part, incomplete bool) []*Part {
	// Per-track order survives retiming across the other track and speaker
	// relabeling. A start is evidence for an unchanged row, never an ID.
	prefix := 0
	for prefix < min(len(previous), len(current)) && key(previous[prefix]) == key(current[prefix]) {
		current[prefix].ID = previous[prefix].ID
		prefix++
	}
	if prefix == len(current) {
		// The file can be read between writes of the final prefix and tail.
		return previous
	}
	if prefix == len(previous) {
		return current
	}

	// Unchanged rows anchor revisions on either side and keep rows inserted
	// earlier in the transcript from shifting the rest of the track.
	positions := make(map[rowKey][]int)
	for i := prefix; i < len(previous); i++ {
		k := key(previous[i])
		positions[k] = append(positions[k], i)
	}
	old, revised := prefix, prefix
	for i := prefix; i < len(current); i++ {
		k := key(current[i])
		indices := positions[k]
		for len(indices) > 0 && indices[0] < old {
			indices = indices[1:]
		}
		positions[k] = indices
		if len(indices) == 0 {
			continue
		}
		j := indices[0]
		// Extra rows before an anchor can be backfilled speech.
		from := max(revised, i-(j-old))
		reuseIDs(previous[old:j], current[from:i])
		current[i].ID = previous[j].ID
		old, revised = j+1, i+1
	}
	// After the last anchor, the recognizer revises its existing tail in
	// track order before appending more speech.
	matched := reuseIDs(previous[old:], current[revised:])
	if incomplete {
		// An unfinished line can hide later rows on either track.
		return append(current, previous[old+matched:]...)
	}
	return current
}

func reuseIDs(previous, current []*Part) int {
	matched := min(len(previous), len(current))
	for i := range matched {
		current[i].ID = previous[i].ID
	}
	return matched
}
