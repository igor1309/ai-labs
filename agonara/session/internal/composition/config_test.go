package composition

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validConfig() map[string]string {
	return map[string]string{
		"AGONARA_BASE_URL": "https://content.example", "AGONARA_LOGIN": "student", "AGONARA_PASSWORD": "password", "WEB_TOKEN": "web-token", "BOT_TOKEN": "bot-token", "CHAT_ID": "17", "SESSION_SHARED_STATE_PATH": "/tmp/reading.json", "TELEGRAM_STATE_PATH": "/tmp/transport.json", "SESSION_STATE_PATH": "/tmp/bot.json", "WEB_PLACE_PATH": "/tmp/web-place.json", "WEB_SESSION_STATE_PATH": "/tmp/standalone.json",
	}
}
func TestConfigurationFailsClosedAndStandaloneUsesIsolatedState(t *testing.T) {
	t.Parallel()
	for _, key := range []string{"AGONARA_BASE_URL", "AGONARA_LOGIN", "AGONARA_PASSWORD", "WEB_TOKEN", "BOT_TOKEN", "CHAT_ID", "SESSION_SHARED_STATE_PATH", "TELEGRAM_STATE_PATH"} {
		t.Run(key, func(t *testing.T) {
			t.Parallel()
			env := validConfig()
			delete(env, key)
			_, err := Configuration(func(k string) string { return env[k] }, false, lexicalPath)
			if err == nil {
				t.Fatalf("missing %s accepted", key)
			}
		})
	}
	env := validConfig()
	get := func(k string) string { return env[k] }
	c, err := Configuration(get, false, lexicalPath)
	if err != nil || c.StatePath != "/tmp/reading.json" || c.PageSize != 1000 {
		t.Fatalf("%+v %v", c, err)
	}
	delete(env, "BOT_TOKEN")
	delete(env, "CHAT_ID")
	c, err = Configuration(get, true, lexicalPath)
	if err != nil || c.StatePath != "/tmp/standalone.json" {
		t.Fatalf("%+v %v", c, err)
	}
	env["WEB_SESSION_STATE_PATH"] = "/tmp/reading.json"
	if _, err = Configuration(get, true, lexicalPath); err == nil {
		t.Fatal("standalone shared state accepted")
	}
	delete(env, "WEB_SESSION_STATE_PATH")
	if _, err = Configuration(get, true, lexicalPath); err == nil || !strings.Contains(err.Error(), "WEB_SESSION_STATE_PATH") {
		t.Fatalf("%v", err)
	}
}
func TestConfigurationRejectsInvalidSettingsAndOverlappingPaths(t *testing.T) {
	t.Parallel()
	for key, value := range map[string]string{"AGONARA_BASE_URL": "file:///secrets", "WEB_ADDR": ":bad", "SESSION_PAGE_SIZE": "-1", "CHAT_ID": "garbage", "TELEGRAM_STATE_PATH": "/tmp/reading.json", "SESSION_SHARED_STATE_PATH": "relative.json", "WEB_PLACE_PATH": "/tmp/../tmp/bot.json"} {
		t.Run(key, func(t *testing.T) {
			t.Parallel()
			env := validConfig()
			env[key] = value
			if _, err := Configuration(func(k string) string { return env[k] }, false, lexicalPath); err == nil {
				t.Fatalf("%s accepted", key)
			}
		})
	}
}

func lexicalPath(path string) (string, error) { return filepath.Clean(path), nil }

func TestConfigurationUsesResolverAndFailsOnResolutionErrors(t *testing.T) {
	t.Parallel()
	env := validConfig()
	var paths []string
	c, err := Configuration(func(k string) string { return env[k] }, false, func(path string) (string, error) { paths = append(paths, path); return "/resolved" + path, nil })
	if err != nil || c.StatePath != "/resolved/tmp/reading.json" || c.TransportPath != "/resolved/tmp/transport.json" || len(paths) != 4 {
		t.Fatalf("%+v paths=%v %v", c, paths, err)
	}
	failure := errors.New("cannot resolve")
	_, err = Configuration(func(k string) string { return env[k] }, false, func(string) (string, error) { return "", failure })
	if !errors.Is(err, failure) {
		t.Fatal(err)
	}
	if _, err = Configuration(func(k string) string { return env[k] }, false, nil); err == nil {
		t.Fatal("missing resolver accepted")
	}
}

// Contract test: filesystem path resolution across directory and final-component symlinks.
func TestConfigurationRejectsFilesystemAliasesWithoutCreatingState(t *testing.T) {
	t.Parallel()
	for _, scenario := range []string{"existing", "missing file", "missing ancestors", "final symlink", "dangling final symlink", "dangling ancestor"} {
		t.Run(scenario, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			realDir := filepath.Join(dir, "real")
			if err := os.Mkdir(realDir, 0700); err != nil {
				t.Fatal(err)
			}
			alias := filepath.Join(dir, "alias")
			if err := os.Symlink(realDir, alias); err != nil {
				t.Fatal(err)
			}
			name := "reading.json"
			if scenario == "missing ancestors" {
				name = "future/nested/reading.json"
			}
			reading := filepath.Join(realDir, name)
			transport := filepath.Join(alias, name)
			if scenario == "existing" || scenario == "final symlink" {
				if err := os.WriteFile(reading, []byte("rollback"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "final symlink" || scenario == "dangling final symlink" {
				transport = filepath.Join(dir, "linked.json")
				if err := os.Symlink(reading, transport); err != nil {
					t.Fatal(err)
				}
			}
			if scenario == "dangling ancestor" {
				if err := os.Remove(alias); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(filepath.Join(dir, "absent"), alias); err != nil {
					t.Fatal(err)
				}
			}
			env := filesystemConfig(dir)
			env["SESSION_SHARED_STATE_PATH"] = reading
			env["TELEGRAM_STATE_PATH"] = transport
			for _, mode := range []bool{false, true} {
				_, err := Configuration(func(k string) string { return env[k] }, mode, ResolveStatePath)
				if err == nil {
					t.Fatalf("%s standalone=%v accepted", scenario, mode)
				}
			}
			if scenario == "existing" || scenario == "final symlink" {
				data, err := os.ReadFile(reading)
				if err != nil || string(data) != "rollback" {
					t.Fatalf("%s %v", data, err)
				}
			} else if _, err := os.Lstat(reading); !os.IsNotExist(err) {
				t.Fatalf("state created: %v", err)
			}
		})
	}
}

// Contract test: distinct missing state files below symlinked ancestors resolve to stable lock destinations.
func TestConfigurationCanonicalizesDistinctMissingDestinations(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	alias := filepath.Join(dir, "alias")
	if err := os.Symlink(dir, alias); err != nil {
		t.Fatal(err)
	}
	env := filesystemConfig(dir)
	env["SESSION_SHARED_STATE_PATH"] = filepath.Join(alias, "future", "reading.json")
	env["TELEGRAM_STATE_PATH"] = filepath.Join(dir, "future", "transport.json")
	c, err := Configuration(func(k string) string { return env[k] }, false, ResolveStatePath)
	realDir, resolveErr := filepath.EvalSymlinks(dir)
	if err != nil || resolveErr != nil || c.StatePath != filepath.Join(realDir, "future", "reading.json") || c.TransportPath != filepath.Join(realDir, "future", "transport.json") {
		t.Fatalf("%+v %v %v", c, err, resolveErr)
	}
}

func filesystemConfig(dir string) map[string]string {
	env := validConfig()
	for _, key := range []string{"SESSION_SHARED_STATE_PATH", "TELEGRAM_STATE_PATH", "SESSION_STATE_PATH", "WEB_PLACE_PATH", "WEB_SESSION_STATE_PATH"} {
		env[key] = filepath.Join(dir, filepath.Base(env[key]))
	}
	return env
}

// Contract test: final-component symlinks are unsafe for every configured state role, including legacy reads.
func TestConfigurationRejectsFinalSymlinksForEveryStateRole(t *testing.T) {
	t.Parallel()
	for _, role := range []string{"SESSION_SHARED_STATE_PATH", "TELEGRAM_STATE_PATH", "SESSION_STATE_PATH", "WEB_PLACE_PATH", "WEB_SESSION_STATE_PATH"} {
		t.Run(role, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			env := filesystemConfig(dir)
			target := filepath.Join(dir, "retained.json")
			if err := os.WriteFile(target, []byte("retained"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(target, env[role]); err != nil {
				t.Fatal(err)
			}
			_, err := Configuration(func(k string) string { return env[k] }, role == "WEB_SESSION_STATE_PATH", ResolveStatePath)
			if err == nil || !strings.Contains(err.Error(), "state file must not be a symlink") {
				t.Fatalf("%s: %v", role, err)
			}
			data, err := os.ReadFile(target)
			if err != nil || string(data) != "retained" {
				t.Fatalf("retained bytes %s %v", data, err)
			}
		})
	}
}
