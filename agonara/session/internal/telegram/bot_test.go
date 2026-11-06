package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
)

const chat = int64(1)

type call struct {
	method string
	params map[string]any
}

type fakeAPI struct {
	calls []call
	fail  func(method string, params map[string]any) error
}

func (a *fakeAPI) Call(_ context.Context, method string, params map[string]any) (json.RawMessage, error) {
	a.calls = append(a.calls, call{method, params})
	if a.fail != nil {
		return nil, a.fail(method, params)
	}
	return nil, nil
}

func (a *fakeAPI) methods() []string {
	var out []string
	for _, c := range a.calls {
		out = append(out, c.method)
	}
	return out
}

func noRich(method string, params map[string]any) error {
	if params["rich_message"] != nil {
		return fmt.Errorf("%s failed: 400 Bad Request: rich messages are not supported", method)
	}
	return nil
}

func makeFlow(body string) Actor {
	return func(_ context.Context, s flow.Session, _ string) (*flow.Result, error) {
		s.Step++
		return &flow.Result{Session: s, View: flow.View{Title: "Programs", Body: body},
			Actions: []flow.Action{{ID: "open_0", Kind: "item", Label: "1"}}}, nil
	}
}

func message() Update { return Update{Message: &Message{Chat: Chat{ID: chat}}} }

func press(data string, chatID int64) Update {
	return Update{CallbackQuery: &CallbackQuery{ID: "cb", Data: data, Message: &Message{MessageID: 7, Chat: Chat{ID: chatID}}}}
}

func newState() State { return State{Session: flow.InitialSession()} }

func handle(t *testing.T, api *fakeAPI, update Update, state State, act Actor, logs *[]string) State {
	t.Helper()
	log := func(string) {}
	if logs != nil {
		log = func(line string) { *logs = append(*logs, line) }
	}
	next, err := Bot{API: api, Act: act, AllowedChatID: chat, Log: log}.Handle(context.Background(), update, state)
	if err != nil {
		t.Fatal(err)
	}
	return next
}

func TestMessageGetsOneRichMessage(t *testing.T) {
	api := &fakeAPI{}
	handle(t, api, message(), newState(), makeFlow("Study algebra."), nil)
	equal(t, api.methods(), []string{"sendRichMessage"})
	equal(t, api.calls[0].params["rich_message"], map[string]any{"html": "<h2>Programs</h2><p>Study algebra.</p>"})
}

func TestRefusedRichMessageFallsBackToPlainAndIsLogged(t *testing.T) {
	api := &fakeAPI{fail: noRich}
	var logs []string
	handle(t, api, message(), newState(), makeFlow("Study algebra."), &logs)
	equal(t, api.methods(), []string{"sendRichMessage", "sendMessage"})
	equal(t, api.calls[1].params["text"], "<b>Programs</b>\n\nStudy algebra.")
	equal(t, api.calls[1].params["parse_mode"], "HTML")
	if !strings.Contains(strings.Join(logs, "\n"), "rich messages are not supported") {
		t.Fatal(logs)
	}
}

func TestOtherChatsGetNothing(t *testing.T) {
	api := &fakeAPI{}
	act := func(context.Context, flow.Session, string) (*flow.Result, error) {
		t.Fatal("reached flow")
		return nil, nil
	}
	state := newState()
	handle(t, api, Update{Message: &Message{Chat: Chat{ID: 2}}}, state, act, nil)
	handle(t, api, press("0:open_0", 2), state, act, nil)
	equal(t, len(api.calls), 0)
}

func TestCurrentButtonEditsItsMessage(t *testing.T) {
	api := &fakeAPI{}
	state := handle(t, api, press("0:open_0", chat), newState(), makeFlow("Study algebra."), nil)
	equal(t, state.Session.Step, 1)
	equal(t, api.methods(), []string{"answerCallbackQuery", "editMessageText"})
	equal(t, api.calls[1].params["message_id"], int64(7))
	equal(t, api.calls[1].params["rich_message"], map[string]any{"html": "<h2>Programs</h2><p>Study algebra.</p>"})
}

func TestUnchangedScreenSendsNothingNew(t *testing.T) {
	api := &fakeAPI{fail: func(method string, _ map[string]any) error {
		if method == "editMessageText" {
			return errors.New("editMessageText failed: 400 Bad Request: message is not modified")
		}
		return nil
	}}
	handle(t, api, press("0:open_0", chat), newState(), makeFlow(""), nil)
	equal(t, api.methods(), []string{"answerCallbackQuery", "editMessageText"})
}

func TestMessageThatCannotBeEditedGetsANewOne(t *testing.T) {
	api := &fakeAPI{fail: func(method string, _ map[string]any) error {
		if method == "editMessageText" {
			return errors.New("editMessageText failed: 400 Bad Request: message can't be edited")
		}
		return nil
	}}
	handle(t, api, press("0:open_0", chat), newState(), makeFlow(""), nil)
	equal(t, api.methods(), []string{"answerCallbackQuery", "editMessageText", "sendRichMessage"})
}

func TestWithoutRichAButtonEditsThePlainScreen(t *testing.T) {
	api := &fakeAPI{fail: noRich}
	handle(t, api, press("0:open_0", chat), newState(), makeFlow(""), nil)
	equal(t, api.methods(), []string{"answerCallbackQuery", "editMessageText", "sendRichMessage", "editMessageText"})
	equal(t, api.calls[3].params["reply_markup"].(Keyboard).InlineKeyboard[0][0].CallbackData, "1:open_0")
}

func TestOldButtonIsAnsweredAndChangesNothing(t *testing.T) {
	api := &fakeAPI{}
	state := newState()
	state.Session.Step = 3
	act := func(context.Context, flow.Session, string) (*flow.Result, error) {
		t.Fatal("reached flow")
		return nil, nil
	}
	equal(t, handle(t, api, press("1:open_0", chat), state, act, nil), state)
	equal(t, api.methods(), []string{"answerCallbackQuery"})
	if !strings.Contains(api.calls[0].params["text"].(string), "out of date") {
		t.Fatal(api.calls[0].params)
	}
}

func TestUnparsableMarkupIsSentPlain(t *testing.T) {
	api := &fakeAPI{fail: func(method string, params map[string]any) error {
		if err := noRich(method, params); err != nil {
			return err
		}
		if params["parse_mode"] != nil {
			return errors.New("sendMessage failed: 400 Bad Request: can't parse entities")
		}
		return nil
	}}
	handle(t, api, message(), newState(), makeFlow("a < b & c"), nil)
	equal(t, api.methods(), []string{"sendRichMessage", "sendMessage", "sendMessage"})
	equal(t, api.calls[2].params["text"], "Programs\n\na < b & c")
}

func TestLongPlainScreenArrivesSplitWithButtonsLast(t *testing.T) {
	api := &fakeAPI{fail: noRich}
	var lines []string
	for i := 1; i <= 300; i++ {
		lines = append(lines, fmt.Sprintf("Line %d of the long reply.", i))
	}
	body := strings.Join(append(lines, "END OF LONG REPLY"), "\n")
	handle(t, api, press("0:open_0", chat), newState(), makeFlow(body), nil)
	var sent []call
	for _, c := range api.calls {
		if c.method == "sendMessage" {
			sent = append(sent, c)
		}
	}
	if len(sent) < 2 {
		t.Fatal("want split")
	}
	var texts []string
	for index, c := range sent {
		texts = append(texts, c.params["text"].(string))
		if _, has := c.params["reply_markup"]; has != (index == len(sent)-1) {
			t.Fatal("buttons must be on the last part only")
		}
	}
	equal(t, strings.Join(texts, "\n"), "<b>Programs</b>\n\n"+body)
}

func TestUnknownActionIsAcknowledged(t *testing.T) {
	api := &fakeAPI{}
	state := newState()
	act := func(context.Context, flow.Session, string) (*flow.Result, error) { return nil, nil }
	equal(t, handle(t, api, press("0:open_99", chat), state, act, nil), state)
	equal(t, api.calls, []call{{"answerCallbackQuery", map[string]any{"callback_query_id": "cb", "text": "Unknown action."}}})
}

func TestAgonaraFailureLogsKeepsStateAndAllowsTheNextUpdate(t *testing.T) {
	for name, update := range map[string]Update{"message": message(), "callback": press("0:open_0", chat)} {
		t.Run(name, func(t *testing.T) {
			api := &fakeAPI{}
			var logs []string
			state := newState()
			act := func(context.Context, flow.Session, string) (*flow.Result, error) {
				return nil, errors.New("GET /programs failed (HTTP 503): request rejected")
			}
			equal(t, handle(t, api, update, state, act, &logs), state)
			equal(t, logs, []string{"ERROR: GET /programs failed (HTTP 503): request rejected"})
			last := api.calls[len(api.calls)-1]
			equal(t, last, call{"sendMessage", map[string]any{"chat_id": chat, "text": "Could not load Agonara: GET /programs failed (HTTP 503): request rejected"}})
			equal(t, handle(t, api, update, state, makeFlow(""), nil).Session.Step, 1)
		})
	}
}

func TestEachUpdateLogsItsTap(t *testing.T) {
	var logs []string
	act := func(_ context.Context, s flow.Session, _ string) (*flow.Result, error) {
		page, count := 2, 9
		return &flow.Result{Session: flow.Session{Place: flow.Place{Screen: "entity", Page: &page, Contents: true}, PageCount: &count, Step: 1}}, nil
	}
	handle(t, &fakeAPI{}, press("0:next", chat), newState(), act, &logs)
	equal(t, logs, []string{"tap next -> entity page 3/9 contents"})
}
