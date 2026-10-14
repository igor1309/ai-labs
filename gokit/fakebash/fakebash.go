// Package fakebash is the bash a command runs under in a test:
// `bash -c <command>`, run in process (supervisortest.InProcess), for the
// part of the shell the tests' commands are written in.
//
// That part is lists of commands joined by ;, &&, || and &, { } groups,
// double-quoted words, and > and >> on a command; the commands are echo,
// cat, grep -qx, test, touch, true, exit, wait and `tail -f /dev/null`,
// which blocks until the process is ended. Anything else ends the script
// with a message that names it and a code bash keeps for such failures
// (2 for syntax, 127 for a command): the fake never guesses at a shell it
// does not run. The contract test runs the same commands under the real
// bash.
package fakebash

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/igor1309/ai-labs/gokit/fakeproc"
)

// Main runs `-c <command>` as bash does and returns the script's exit
// code.
func Main(p fakeproc.Process) int {
	if len(p.Args) != 2 || p.Args[0] != "-c" {
		fmt.Fprintf(p.Stderr, "fakebash: started with %q, want -c <command>\n", p.Args)
		return 2
	}
	tokens, err := split(p.Args[1])
	if err == nil {
		var script list
		if script, tokens, err = parseList(tokens); err == nil && len(tokens) > 0 {
			err = fmt.Errorf("unexpected %q", tokens[0].text)
		}
		if err == nil {
			code, _ := (&shell{p: p}).run(script)
			return code
		}
	}
	fmt.Fprintf(p.Stderr, "fakebash: %v in %q: not shell this fake runs\n", err, p.Args[1])
	return 2
}

// token is a word or an operator of the command line.
type token struct {
	text string
	// operator is set for ;, &, &&, ||, > and >>; a word that is { or },
	// unquoted, is the group's.
	operator bool
	quoted   bool
}

// split cuts a command line into its words and operators.
func split(line string) ([]token, error) {
	var tokens []token
	var word strings.Builder
	inWord, quoted := false, false
	end := func() {
		if inWord {
			tokens = append(tokens, token{text: word.String(), quoted: quoted})
		}
		word.Reset()
		inWord, quoted = false, false
	}
	for n := 0; n < len(line); n++ {
		switch c := line[n]; c {
		case ' ', '\t':
			end()
		case '"':
			closing := strings.IndexByte(line[n+1:], '"')
			if closing < 0 {
				return nil, errors.New("an unclosed quote")
			}
			text := line[n+1 : n+1+closing]
			if strings.ContainsAny(text, "$`\\") {
				return nil, fmt.Errorf("an expansion in %q", text)
			}
			word.WriteString(text)
			inWord, quoted = true, true
			n += closing + 1
		case ';', '&', '|', '>':
			end()
			operator := string(c)
			if c != ';' && n+1 < len(line) && line[n+1] == c {
				operator += string(c)
				n++
			}
			if operator == "|" {
				return nil, errors.New("a pipe")
			}
			tokens = append(tokens, token{text: operator, operator: true})
		case '$', '`', '\'', '\\', '<', '(', ')', '*', '?', '[', ']', '~', '#', '\n':
			return nil, fmt.Errorf("%q", string(c))
		default:
			word.WriteByte(c)
			inWord = true
		}
	}
	end()
	for _, t := range tokens {
		if !t.operator && !t.quoted && len(t.text) > 1 && strings.ContainsAny(t.text, "{}") {
			return nil, fmt.Errorf("the braces of %q", t.text)
		}
	}
	return tokens, nil
}

// list is commands run one after another; its code is the last one's.
type list []item

// item is a pipeline of the list: commands joined by && and ||, run in the
// background if & ends it.
type item struct {
	first      command
	rest       []conditional
	background bool
}

// conditional is a command run only if the code before it is zero (&&) or
// is not (||).
type conditional struct {
	onFailure bool
	command   command
}

// command is a simple command (args, its stdout to the file `to` when
// set) or a group.
type command struct {
	args    []string
	to      string
	appends bool
	group   list
}

// reserved says t is the unquoted word text.
func (t token) reserved(text string) bool { return !t.operator && !t.quoted && t.text == text }

// parseList reads commands up to the end or the } that closes the group
// they are in, and returns what follows.
func parseList(tokens []token) (list, []token, error) {
	var commands list
	for len(tokens) > 0 && !tokens[0].reserved("}") {
		var next item
		var err error
		if next.first, tokens, err = parseCommand(tokens); err != nil {
			return nil, nil, err
		}
		for len(tokens) > 0 && tokens[0].operator && (tokens[0].text == "&&" || tokens[0].text == "||") {
			then := conditional{onFailure: tokens[0].text == "||"}
			if then.command, tokens, err = parseCommand(tokens[1:]); err != nil {
				return nil, nil, err
			}
			next.rest = append(next.rest, then)
		}
		ended := len(tokens) > 0 && tokens[0].operator && (tokens[0].text == ";" || tokens[0].text == "&")
		if ended {
			next.background = tokens[0].text == "&"
			tokens = tokens[1:]
		}
		commands = append(commands, next)
		if !ended {
			break
		}
	}
	if len(commands) == 0 {
		return nil, nil, errors.New("an empty command")
	}
	return commands, tokens, nil
}

func parseCommand(tokens []token) (command, []token, error) {
	var c command
	if len(tokens) > 0 && tokens[0].reserved("{") {
		group, rest, err := parseList(tokens[1:])
		if err != nil {
			return c, nil, err
		}
		if len(rest) == 0 || !rest[0].reserved("}") {
			return c, nil, errors.New("a group that } does not close")
		}
		c.group = group
		return c, rest[1:], nil
	}
	for len(tokens) > 0 {
		t := tokens[0]
		if t.operator && (t.text == ">" || t.text == ">>") {
			if len(tokens) < 2 || tokens[1].operator || c.to != "" {
				return c, nil, fmt.Errorf("the redirection %s", t.text)
			}
			c.to, c.appends = tokens[1].text, t.text == ">>"
			tokens = tokens[2:]
			continue
		}
		if t.operator {
			break
		}
		c.args = append(c.args, t.text)
		tokens = tokens[1:]
	}
	if len(c.args) == 0 {
		return c, nil, errors.New("an empty command")
	}
	return c, tokens, nil
}

// shell runs a script as the process p.
type shell struct {
	p fakeproc.Process
	// jobs are the commands started with &, for wait.
	jobs sync.WaitGroup
}

// run runs the list and returns the last command's code; exited says the
// script ends there: exit ran, or the process was ended.
func (s *shell) run(commands list) (code int, exited bool) {
	for _, next := range commands {
		if next.background {
			s.jobs.Add(1)
			go func() {
				defer s.jobs.Done()
				s.item(next)
			}()
			code = 0
			continue
		}
		if code, exited = s.item(next); exited {
			return code, true
		}
	}
	return code, false
}

func (s *shell) item(next item) (code int, exited bool) {
	if code, exited = s.command(next.first); exited {
		return code, true
	}
	for _, then := range next.rest {
		if then.onFailure == (code != 0) {
			if code, exited = s.command(then.command); exited {
				return code, true
			}
		}
	}
	return code, false
}

func (s *shell) command(c command) (code int, exited bool) {
	if s.p.Context.Err() != nil {
		return 1, true
	}
	if c.group != nil {
		return s.run(c.group)
	}
	stdout := s.p.Stdout
	if c.to != "" {
		flag := os.O_WRONLY | os.O_CREATE | os.O_TRUNC
		if c.appends {
			flag = os.O_WRONLY | os.O_CREATE | os.O_APPEND
		}
		file, err := os.OpenFile(s.p.Path(c.to), flag, 0o666)
		if err != nil {
			fmt.Fprintf(s.p.Stderr, "bash: %s: %s\n", c.to, reason(err))
			return 1, false
		}
		defer file.Close()
		stdout = file
	}
	name, args := c.args[0], c.args[1:]
	switch {
	case name == "true" && len(args) == 0:
		return 0, false
	case name == "echo" && (len(args) == 0 || !strings.HasPrefix(args[0], "-")):
		fmt.Fprintln(stdout, strings.Join(args, " "))
		return 0, false
	case name == "exit" && len(args) == 1:
		if code, err := strconv.Atoi(args[0]); err == nil && code >= 0 && code <= 255 {
			return code, true
		}
	case name == "wait" && len(args) == 0:
		s.jobs.Wait()
		return 0, s.p.Context.Err() != nil
	case name == "tail" && len(args) == 2 && args[0] == "-f" && args[1] == os.DevNull:
		return s.p.Block(), true
	case name == "cat" && len(args) > 0 && plain(args):
		for _, file := range args {
			data, err := os.ReadFile(s.p.Path(file))
			if err != nil {
				fmt.Fprintf(s.p.Stderr, "cat: %s: %s\n", file, reason(err))
				code = 1
				continue
			}
			_, _ = stdout.Write(data)
		}
		return code, false
	case name == "grep" && len(args) == 3 && args[0] == "-qx" && literal(args[1]):
		file, err := os.Open(s.p.Path(args[2]))
		if err != nil {
			fmt.Fprintf(s.p.Stderr, "grep: %s: %s\n", args[2], reason(err))
			return 2, false
		}
		defer file.Close()
		lines := bufio.NewScanner(file)
		for lines.Scan() {
			if lines.Text() == args[1] {
				return 0, false
			}
		}
		return 1, false
	case name == "touch" && len(args) == 1 && plain(args):
		path, now := s.p.Path(args[0]), time.Now()
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE, 0o666)
		if err == nil {
			file.Close()
			err = os.Chtimes(path, now, now)
		}
		if err != nil {
			fmt.Fprintf(s.p.Stderr, "touch: %s: %s\n", args[0], reason(err))
			return 1, false
		}
		return 0, false
	case name == "test":
		if holds, ok := s.test(args); ok {
			if holds {
				return 0, false
			}
			return 1, false
		}
	}
	fmt.Fprintf(s.p.Stderr, "fakebash: %q: not a command this fake runs\n", strings.Join(c.args, " "))
	return 127, true
}

// test evaluates `test [!] -e|-f <file>`; ok is false for any other
// expression.
func (s *shell) test(args []string) (holds, ok bool) {
	not := len(args) == 3 && args[0] == "!"
	if not {
		args = args[1:]
	}
	if len(args) != 2 || (args[0] != "-e" && args[0] != "-f") {
		return false, false
	}
	info, err := os.Stat(s.p.Path(args[1]))
	holds = err == nil && (args[0] == "-e" || info.Mode().IsRegular())
	return holds != not, true
}

// plain says none of the arguments is an option.
func plain(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "-") {
			return false
		}
	}
	return true
}

// literal says a pattern matches only itself: it has nothing a regular
// expression reads as more than a character.
func literal(pattern string) bool {
	return pattern != "" && !strings.ContainsAny(pattern, `.^$*+?()[]{}|\`) && !strings.HasPrefix(pattern, "-")
}

// reason is why a file could not be opened, as the system's tools say it.
func reason(err error) string {
	var path *fs.PathError
	if errors.As(err, &path) {
		err = path.Err
	}
	text := err.Error()
	return strings.ToUpper(text[:1]) + text[1:]
}
