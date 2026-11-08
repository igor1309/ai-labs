package envfile

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Contract test: env files are read from disk and applied to the process environment.
// Serial: modifies the process environment.
func TestLoadEnvReadsPairsSkipsCommentsAndKeepsSetValues(t *testing.T) {
	path := filepath.Join(t.TempDir(), "probe.env")
	content := "# comment\n\nSESSION_A=one\nexport SESSION_B=\"two words\"\nSESSION_C='x=y'\nSESSION_D=from-file\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SESSION_D", "from-env")
	for _, key := range []string{"SESSION_A", "SESSION_B", "SESSION_C"} {
		t.Setenv(key, "")
		os.Unsetenv(key)
	}
	if err := Load(path); err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]string{"SESSION_A": "one", "SESSION_B": "two words", "SESSION_C": "x=y", "SESSION_D": "from-env"} {
		if got := os.Getenv(key); got != want {
			t.Fatalf("%s = %q, want %q", key, got, want)
		}
	}
}

// Contract test: env files are read from disk and applied to the process environment.
// Serial: modifies the process environment.
func TestLoadEnvNamesABadLineWithoutItsContent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "probe.env")
	if err := os.WriteFile(path, []byte("A=1\nsecret-without-equals\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := Load(path)
	if err == nil || !strings.Contains(err.Error(), "line 2") || strings.Contains(err.Error(), "secret") {
		t.Fatal(err)
	}
}
