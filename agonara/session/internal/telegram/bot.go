package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// API calls one Bot API method; injected so tests need no network.
type API interface {
	Call(ctx context.Context, method string, params map[string]any) (json.RawMessage, error)
}

// Chat is the chat a message is in.
type Chat struct {
	ID int64 `json:"id"`
}

// Message is the part of a Telegram message the bot reads.
type Message struct {
	MessageID int64 `json:"message_id"`
	Chat      Chat  `json:"chat"`
}

// CallbackQuery is a button press.
type CallbackQuery struct {
	ID      string   `json:"id"`
	Data    string   `json:"data"`
	Message *Message `json:"message"`
}

// Update is one Telegram update.
type Update struct {
	UpdateID      int64          `json:"update_id"`
	Message       *Message       `json:"message"`
	CallbackQuery *CallbackQuery `json:"callback_query"`
}

// State holds only polling and displayed-message bookkeeping.
type State struct {
	Offset   int64
	Revision int
}

type Session interface {
	Show(context.Context, Request) (*Result, error)
}

// Bot answers one chat.
type Bot struct {
	API           API
	Session       Session
	AllowedChatID int64
	Log           func(string)
}

func NewBot(api API, session Session, chatID int64, log func(string)) (Bot, error) {
	if api == nil || session == nil || chatID == 0 || log == nil {
		return Bot{}, errors.New("bot API, session, allowed chat and logger are required")
	}
	return Bot{API: api, Session: session, AllowedChatID: chatID, Log: log}, nil
}

var (
	notModified = regexp.MustCompile(`message is not modified`)
	cantParse   = regexp.MustCompile(`can't parse entities`)
)

// Handle handles one update and returns the state after it.
func (b Bot) Handle(ctx context.Context, update Update, state State) (State, error) {
	callback := update.CallbackQuery
	var chatID int64
	var messageID *int64
	switch {
	case update.Message != nil:
		chatID = update.Message.Chat.ID
	case callback != nil && callback.Message != nil:
		chatID = callback.Message.Chat.ID
		messageID = &callback.Message.MessageID
	default:
		return state, nil
	}
	if chatID != b.AllowedChatID {
		return state, nil
	}
	actionID := ""
	var revision *int
	if callback != nil {
		step, action, ok := ParseCallback(callback.Data)
		if !ok || step != state.Revision {
			return state, b.answer(ctx, callback, "That button is out of date. Use the latest message.")
		}
		actionID = action
		revision = &step
	}
	result, err := b.Session.Show(ctx, Request{Action: actionID, Revision: revision})
	if errors.Is(err, ErrStale) {
		return state, b.answer(ctx, callback, "That button is out of date. Use the latest message.")
	}
	if err != nil {
		b.Log("ERROR: " + err.Error())
		if callback != nil {
			if err := b.answer(ctx, callback, "Could not load Agonara."); err != nil {
				return state, err
			}
		}
		_, err := b.API.Call(ctx, "sendMessage", map[string]any{"chat_id": chatID, "text": "Could not load Agonara: " + err.Error()})
		return state, err
	}
	if result == nil {
		return state, b.answer(ctx, callback, "Unknown action.")
	}
	b.Log(describe(actionID, result))
	if callback != nil {
		if err := b.answer(ctx, callback, ""); err != nil {
			return state, err
		}
	}
	if err := b.show(ctx, chatID, messageID, result); err != nil {
		return state, err
	}
	state.Revision = result.Revision
	return state, nil
}

func describe(actionID string, session *Result) string {
	line := "message"
	if actionID != "" {
		line = "tap " + actionID
	}
	line += " -> " + session.Screen
	if session.Page != nil {
		line += fmt.Sprintf(" page %d/%d", session.Page.Index+1, session.Page.Count)
	}
	if session.Contents {
		line += " contents"
	}
	return line
}

func (b Bot) answer(ctx context.Context, callback *CallbackQuery, text string) error {
	if callback == nil {
		return nil
	}
	params := map[string]any{"callback_query_id": callback.ID}
	if text != "" {
		params["text"] = text
	}
	_, err := b.API.Call(ctx, "answerCallbackQuery", params)
	return err
}

// show sends a screen as one rich message: a button press redraws its own
// message, a typed message gets a new one. If Telegram refuses the rich
// message, the screen goes out in the plain format instead.
func (b Bot) show(ctx context.Context, chatID int64, messageID *int64, result *Result) error {
	html := RenderRich(result.View, result.Actions, result.Revision)
	if len([]rune(html)) <= RichTextLimit {
		rich := map[string]any{"html": html}
		if messageID != nil {
			_, err := b.API.Call(ctx, "editMessageText", map[string]any{"chat_id": chatID, "message_id": *messageID, "rich_message": rich})
			if err == nil || notModified.MatchString(err.Error()) {
				return nil
			}
			// Any other refusal (an old message, say) falls back to a new message.
		}
		_, err := b.API.Call(ctx, "sendRichMessage", map[string]any{"chat_id": chatID, "rich_message": rich})
		if err == nil {
			return nil
		}
		b.Log("rich message refused, sending plain: " + err.Error())
	}
	return b.showPlain(ctx, chatID, messageID, result)
}

// showPlain is the format before rich messages: HTML text with an inline keyboard.
func (b Bot) showPlain(ctx context.Context, chatID int64, messageID *int64, result *Result) error {
	text, keyboard := Render(result.View, result.Actions, result.Revision)
	if messageID != nil && len([]rune(text)) <= TextLimit {
		_, err := b.API.Call(ctx, "editMessageText", map[string]any{
			"chat_id": chatID, "message_id": *messageID, "text": text, "parse_mode": "HTML", "reply_markup": keyboard,
		})
		if err == nil || notModified.MatchString(err.Error()) {
			return nil
		}
	}
	err := b.send(ctx, chatID, text, keyboard, "HTML")
	if err == nil || !cantParse.MatchString(err.Error()) {
		return err
	}
	// Markup Telegram cannot parse must not stall the update: send it plain.
	return b.send(ctx, chatID, plain(text), keyboard, "")
}

func (b Bot) send(ctx context.Context, chatID int64, text string, keyboard Keyboard, parseMode string) error {
	chunks := SplitText(text, TextLimit)
	for index, chunk := range chunks {
		params := map[string]any{"chat_id": chatID, "text": chunk}
		if parseMode != "" {
			params["parse_mode"] = parseMode
		}
		if index == len(chunks)-1 {
			params["reply_markup"] = keyboard
		}
		if _, err := b.API.Call(ctx, "sendMessage", params); err != nil {
			return err
		}
	}
	return nil
}

var tagPattern = regexp.MustCompile(`<[^>]+>`)

func plain(html string) string {
	return strings.NewReplacer("&lt;", "<", "&gt;", ">", "&amp;", "&").Replace(tagPattern.ReplaceAllString(html, ""))
}
