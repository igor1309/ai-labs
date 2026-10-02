package system_test

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
)

// A stamp sorts as the times it is made at, to the microsecond, is told
// apart from another made at the same time, and is one path segment.
func TestStamp(t *testing.T) {
	ids := system.IDs{}
	earlier := time.Date(2026, 10, 2, 11, 59, 59, 999_999_000, time.UTC)
	later := earlier.Add(time.Microsecond)
	first, second := ids.Stamp(earlier), ids.Stamp(later)
	if first >= second {
		t.Fatalf("%s sorts after %s, a microsecond later", first, second)
	}
	same, again := ids.Stamp(later), ids.Stamp(later)
	if same == again {
		t.Fatalf("two stamps at the same time: %s", same)
	}
	for _, stamp := range []string{first, second, same, again} {
		if stamp != filepath.Base(stamp) || !filepath.IsLocal(stamp) || strings.HasPrefix(stamp, ".") || strings.ContainsAny(stamp, `/\`) {
			t.Errorf("stamp %q is not one path segment", stamp)
		}
	}
	// In another zone, the same instant is stamped as in UTC.
	if zoned := ids.Stamp(later.In(time.FixedZone("east", 3*60*60))); zoned[:len("20261002T120000.000000Z")] != "20261002T120000.000000Z" {
		t.Errorf("stamp %q is not in UTC", zoned)
	}
}
