package composition

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"path/filepath"
	"strconv"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
)

type Config struct {
	BaseURL, Login, Password, WebToken, WebAddr    string
	BotToken                                       string
	ChatID                                         int64
	StatePath, TransportPath, LegacyWeb, LegacyBot string
	PageSize                                       int
}

func Configuration(get func(string) string, standalone bool, resolve func(string) (string, error)) (Config, error) {
	if get == nil || resolve == nil {
		return Config{}, errors.New("environment and state path resolver are required")
	}
	c := Config{BaseURL: get("AGONARA_BASE_URL"), Login: get("AGONARA_LOGIN"), Password: get("AGONARA_PASSWORD"), WebToken: get("WEB_TOKEN"), WebAddr: get("WEB_ADDR"), LegacyWeb: get("WEB_PLACE_PATH"), LegacyBot: get("SESSION_STATE_PATH"), PageSize: flow.PageSize}
	if c.BaseURL == "" || c.Login == "" || c.Password == "" || c.WebToken == "" {
		return c, errors.New("AGONARA_BASE_URL, AGONARA_LOGIN, AGONARA_PASSWORD and WEB_TOKEN are required")
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return c, errors.New("invalid AGONARA_BASE_URL")
	}
	if c.WebAddr == "" {
		c.WebAddr = ":8740"
	}
	_, port, err := net.SplitHostPort(c.WebAddr)
	if err != nil {
		return c, errors.New("invalid WEB_ADDR")
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return c, errors.New("WEB_ADDR requires a numeric port from 1 to 65535")
	}
	if raw := get("SESSION_PAGE_SIZE"); raw != "" {
		c.PageSize, err = strconv.Atoi(raw)
		if err != nil || c.PageSize <= 0 {
			return c, errors.New("SESSION_PAGE_SIZE must be positive")
		}
	}
	if standalone {
		c.StatePath = get("WEB_SESSION_STATE_PATH")
		if c.StatePath == "" {
			return c, errors.New("WEB_SESSION_STATE_PATH is required for isolated standalone reading")
		}
	} else {
		c.StatePath = get("SESSION_SHARED_STATE_PATH")
		c.TransportPath = get("TELEGRAM_STATE_PATH")
		c.BotToken = get("BOT_TOKEN")
		c.ChatID, err = strconv.ParseInt(get("CHAT_ID"), 10, 64)
		if c.BotToken == "" || err != nil || c.ChatID == 0 || c.StatePath == "" || c.TransportPath == "" {
			return c, errors.New("BOT_TOKEN, CHAT_ID, SESSION_SHARED_STATE_PATH and TELEGRAM_STATE_PATH are required")
		}
	}
	if c.LegacyWeb == "" && c.LegacyBot != "" {
		c.LegacyWeb = filepath.Join(filepath.Dir(c.LegacyBot), "web-place.json")
	}
	paths := []string{c.StatePath, c.TransportPath, c.LegacyWeb, c.LegacyBot}
	if standalone {
		paths = append(paths, get("SESSION_SHARED_STATE_PATH"), get("TELEGRAM_STATE_PATH"))
	}
	seen := map[string]string{}
	resolvedPaths := map[string]string{}
	for _, path := range paths {
		if path == "" {
			continue
		}
		if !filepath.IsAbs(path) {
			return c, errors.New("state paths must be absolute")
		}
		clean, err := resolve(filepath.Clean(path))
		if err != nil {
			return c, fmt.Errorf("resolve state path %q: %w", path, err)
		}
		if previous, exists := seen[clean]; exists {
			return c, fmt.Errorf("state paths must be distinct: %q and %q resolve to %q", previous, path, clean)
		}
		seen[clean] = path
		resolvedPaths[path] = clean
	}
	for _, path := range []*string{&c.StatePath, &c.TransportPath, &c.LegacyWeb, &c.LegacyBot} {
		if *path != "" {
			*path = resolvedPaths[*path]
		}
	}
	return c, nil
}
func (c Config) String() string { return fmt.Sprintf("reading runner on %s", c.WebAddr) }
