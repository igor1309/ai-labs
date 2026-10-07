package supervisor

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
)

// denying is a /proc whose files named in denied cannot be read, as a
// process's stat that this process may not read.
type denying struct {
	fs.FS
	denied map[string]bool
}

func (d denying) Open(name string) (fs.File, error) {
	if d.denied[name] {
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrPermission}
	}
	return d.FS.Open(name)
}

// proc writes a /proc in a temporary directory: each process's stat, by
// its PID, and a directory without one for each PID in gone.
func proc(t *testing.T, stats map[string]string, gone ...string) string {
	t.Helper()
	root := t.TempDir()
	for pid, stat := range stats {
		if err := os.Mkdir(filepath.Join(root, pid), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, pid, "stat"), []byte(stat), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, pid := range gone {
		if err := os.Mkdir(filepath.Join(root, pid), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(root, "self"), 0o755); err != nil {
		t.Fatal(err)
	}
	return root
}

// A process of the group whose stat cannot be read fails the listing: it
// may be a leftover, so the kill's result cannot be told. Only a stat gone
// since the listing, its process exited and reaped, is skipped.
func TestAProcessWhoseStatCannotBeReadFailsTheListing(t *testing.T) {
	t.Parallel()
	const leader = "7 (lead) Z 1 7 7 0 -1"
	for _, c := range []struct {
		name   string
		stats  map[string]string
		gone   []string
		denied []string
		live   bool
		err    error
	}{
		{"a live one", map[string]string{"7": leader, "8": "8 (left (over)) S 1 7 7 0 -1"}, nil, nil, true, nil},
		{"a zombie", map[string]string{"7": leader, "8": "8 (left) Z 1 7 7 0 -1"}, nil, nil, false, nil},
		{"another group's", map[string]string{"7": leader, "8": "8 (other) S 1 8 8 0 -1"}, nil, nil, false, nil},
		{"one gone since the listing", map[string]string{"7": leader}, []string{"8"}, nil, false, nil},
		{"one whose stat is denied", map[string]string{"7": leader, "8": "8 (left) S 1 7 7 0 -1"}, nil, []string{"8/stat"}, false, fs.ErrPermission},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			denied := map[string]bool{}
			for _, name := range c.denied {
				denied[name] = true
			}
			live, err := procOthers(denying{FS: os.DirFS(proc(t, c.stats, c.gone...)), denied: denied}, 7)
			if !errors.Is(err, c.err) {
				t.Fatalf("listing: %v, want %v", err, c.err)
			}
			if live != c.live {
				t.Fatalf("live %v, want %v", live, c.live)
			}
		})
	}
}
