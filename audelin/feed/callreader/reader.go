package callreader

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"time"
)

// Call is the live call as the reader tells it.
type Call struct {
	// ID is the fixed prefix of the call's folder name, kept through
	// renames.
	ID string
	// Start is the time the folder name begins with: call time zero.
	Start time.Time
	Parts []Part
	Ended bool
}

// Reader reads the calls folder Audelin's settings name.
type Reader struct {
	dir string
	loc *time.Location
	// found is the call followed once one was found; the reader stays on
	// it to its end, whatever starts after it.
	found *folder
	parts partIDs
}

// New makes a reader of the calls folder dir, whose folder names tell
// local times in loc.
func New(dir string, loc *time.Location) *Reader { return &Reader{dir: dir, loc: loc} }

var folderID = regexp.MustCompile(`^(\d{4}\.\d{2}\.\d{2}-\d{4})(?:-([2-9][0-9]*|1[0-9]+))?(?: |$)`)

type folder struct {
	name   string
	id     string
	start  time.Time
	number int
}

// Live gives the call being recorded, or false when none is. An error is
// a failed read.
func (r *Reader) Live() (Call, bool, error) {
	folders, err := r.folders()
	if err != nil {
		return Call{}, false, err
	}
	if r.found != nil {
		return r.follow(folders)
	}
	for _, f := range folders {
		text, err := os.ReadFile(filepath.Join(r.dir, f.name, "transcript.md"))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return Call{}, false, err
		}
		t, err := parse(string(text))
		if err != nil {
			return Call{}, false, err
		}
		if !recording(t.origin) {
			continue
		}
		r.found = &f
		return Call{ID: f.id, Start: f.start, Parts: r.parts.assign(t.parts, t.incomplete)}, true, nil
	}
	return Call{}, false, nil
}

// follow reads the followed call, under whatever name its folder has now.
// A finishing stage told means the call has ended.
func (r *Reader) follow(folders []folder) (Call, bool, error) {
	for _, f := range folders {
		if f.id != r.found.id {
			continue
		}
		text, err := os.ReadFile(filepath.Join(r.dir, f.name, "transcript.md"))
		if err != nil {
			return Call{}, false, err
		}
		t, err := parse(string(text))
		if err != nil {
			return Call{}, false, err
		}
		call := Call{ID: f.id, Start: f.start, Parts: r.parts.assign(t.parts, t.incomplete)}
		if t.origin != nil && len(t.origin.Calls) == 1 && t.origin.Calls[0].Origin != nil {
			call.Ended = t.origin.Calls[0].Origin.finishing()
		}
		return call, true, nil
	}
	return Call{}, false, errGone
}

// errGone is the followed call's folder no longer being in the calls
// folder.
var errGone = errors.New("the followed call's folder is gone")

// folders gives the call folders, newest first.
func (r *Reader) folders() ([]folder, error) {
	entries, err := os.ReadDir(r.dir)
	if err != nil {
		return nil, err
	}
	var out []folder
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		m := folderID.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		start, err := time.ParseInLocation("2006.01.02-1504", m[1], r.loc)
		if err != nil {
			continue
		}
		number := 1
		if m[2] != "" {
			number, _ = strconv.Atoi(m[2])
		}
		id := m[1]
		if m[2] != "" {
			id += "-" + m[2]
		}
		out = append(out, folder{name: e.Name(), id: id, start: start, number: number})
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].start.Equal(out[j].start) {
			return out[i].start.After(out[j].start)
		}
		return out[i].number > out[j].number
	})
	return out, nil
}

// recording tells a transcript of one call that tells how it was heard
// and no finishing stage.
func recording(o *origin) bool {
	if o == nil || o.MergedBy != nil || len(o.Calls) != 1 || o.Calls[0].Origin == nil {
		return false
	}
	return !o.Calls[0].Origin.finishing()
}
