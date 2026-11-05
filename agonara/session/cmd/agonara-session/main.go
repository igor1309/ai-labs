// Command agonara-session runs the Session bot: it long-polls Telegram and
// answers one chat with the session flow over Agonara's public API.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/store"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
)

func log(message string) {
	fmt.Printf("%s %s\n", time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), message)
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	// -env-file reads KEY=VALUE lines, as node --env-file did, so the
	// secrets stay in a mode-600 file instead of the launchd plist.
	envFile := flag.String("env-file", "", "file of KEY=VALUE lines to load into the environment")
	flag.Parse()
	if *envFile != "" {
		if err := loadEnv(*envFile); err != nil {
			return err
		}
	}
	token := os.Getenv("BOT_TOKEN")
	chatID, _ := strconv.ParseInt(os.Getenv("CHAT_ID"), 10, 64)
	statePath := os.Getenv("SESSION_STATE_PATH")
	baseURL, login, password := os.Getenv("AGONARA_BASE_URL"), os.Getenv("AGONARA_LOGIN"), os.Getenv("AGONARA_PASSWORD")
	if token == "" || chatID == 0 || statePath == "" || baseURL == "" || login == "" || password == "" {
		return errors.New("BOT_TOKEN, CHAT_ID, SESSION_STATE_PATH, AGONARA_BASE_URL, AGONARA_LOGIN and AGONARA_PASSWORD are required")
	}
	client, err := agonara.New(baseURL, login, password, nil)
	if err != nil {
		return err
	}
	// SESSION_PAGE_SIZE tunes how much text a lecture page holds for the phone.
	pageSize, _ := strconv.Atoi(os.Getenv("SESSION_PAGE_SIZE"))
	sessionFlow := flow.Flow{Reader: client, PageSize: pageSize}
	api := telegram.Client{Token: token}
	bot := telegram.Bot{API: api, Act: sessionFlow.Act, AllowedChatID: chatID, Log: log}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	state, err := store.Load(statePath, func() telegram.State { return telegram.State{Session: flow.InitialSession()} })
	if err != nil {
		return fmt.Errorf("read state: %w", err)
	}
	raw, err := api.Call(ctx, "getMe", nil)
	if err != nil {
		return err
	}
	var me struct {
		Username string `json:"username"`
	}
	_ = json.Unmarshal(raw, &me)
	log(fmt.Sprintf("started as @%s, step %d, offset %d", me.Username, state.Session.Step, state.Offset))

	for ctx.Err() == nil {
		raw, err := api.Call(ctx, "getUpdates", map[string]any{
			"offset": state.Offset, "timeout": 25, "allowed_updates": []string{"message", "callback_query"},
		})
		var updates []telegram.Update
		if err == nil {
			err = json.Unmarshal(raw, &updates)
		}
		for _, update := range updates {
			if err != nil {
				break
			}
			log(fmt.Sprintf("update %d", update.UpdateID))
			var next telegram.State
			next, err = bot.Handle(ctx, update, state)
			if err != nil {
				break
			}
			state = next
			state.Offset = update.UpdateID + 1
			err = store.Save(statePath, state)
		}
		if err != nil && ctx.Err() == nil {
			var apiErr *telegram.Error
			if errors.As(err, &apiErr) && apiErr.Code == 409 {
				log("POLL CONFLICT: " + err.Error())
			} else {
				log("ERROR: " + err.Error())
			}
			select {
			case <-ctx.Done():
			case <-time.After(5 * time.Second):
			}
		}
	}
	return nil
}
