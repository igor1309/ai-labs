package composition

import (
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
			_, err := Configuration(func(k string) string { return env[k] }, false)
			if err == nil {
				t.Fatalf("missing %s accepted", key)
			}
		})
	}
	env := validConfig()
	get := func(k string) string { return env[k] }
	c, err := Configuration(get, false)
	if err != nil || c.StatePath != "/tmp/reading.json" || c.PageSize != 1000 {
		t.Fatalf("%+v %v", c, err)
	}
	delete(env, "BOT_TOKEN")
	delete(env, "CHAT_ID")
	c, err = Configuration(get, true)
	if err != nil || c.StatePath != "/tmp/standalone.json" {
		t.Fatalf("%+v %v", c, err)
	}
	env["WEB_SESSION_STATE_PATH"] = "/tmp/reading.json"
	if _, err = Configuration(get, true); err == nil {
		t.Fatal("standalone shared state accepted")
	}
	delete(env, "WEB_SESSION_STATE_PATH")
	if _, err = Configuration(get, true); err == nil || !strings.Contains(err.Error(), "WEB_SESSION_STATE_PATH") {
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
			if _, err := Configuration(func(k string) string { return env[k] }, false); err == nil {
				t.Fatalf("%s accepted", key)
			}
		})
	}
}
