package fsprovenance_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsprovenance"
)

func TestWriter(t *testing.T) {
	store := fsprovenance.Store{Dir: t.TempDir()}
	os.WriteFile(filepath.Join(store.Dir, "abc1234.json"), []byte(`{"writer":{"agent":"w","model_family":"f","run_id":"r"}}`), 0o600)
	writer, err := store.Writer(context.Background(), "abc1234")
	if err != nil || writer == nil || writer.ModelFamily != "f" || writer.RunID != "r" {
		t.Fatalf("%+v %v", writer, err)
	}
	for _, revision := range []string{"fedcba9", "../../etc/passwd", "sha256:abc"} {
		if writer, err := store.Writer(context.Background(), revision); writer != nil || err != nil {
			t.Fatalf("%s: %+v %v", revision, writer, err)
		}
	}
}
