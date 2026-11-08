package inlinehtml

import (
	"regexp"
	"strings"
)

var (
	codePattern = regexp.MustCompile("`([^`]+)`")
	boldPattern = regexp.MustCompile(`\*\*(.+?)\*\*|__(.+?)__`)
	linkPattern = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
)

func inline(text string) string {
	text = codePattern.ReplaceAllString(text, "<code>$1</code>")
	text = boldPattern.ReplaceAllStringFunc(text, func(match string) string {
		groups := boldPattern.FindStringSubmatch(match)
		return "<b>" + groups[1] + groups[2] + "</b>"
	})
	text = italics(text)
	return linkPattern.ReplaceAllString(text, "$1")
}

// italics wraps *text* in <i>: the opening star follows neither a star nor a
// word character and precedes no space; the closing star follows no space
// and precedes no word character.
func italics(text string) string {
	runes := []rune(text)
	var out []rune
	for index := 0; index < len(runes); index++ {
		r := runes[index]
		opens := r == '*' && (index == 0 || (runes[index-1] != '*' && !isWord(runes[index-1]))) &&
			index+1 < len(runes) && !isSpaceRune(runes[index+1])
		if opens {
			closing := -1
			for j := index + 2; j < len(runes); j++ {
				if runes[j] == '*' && !isSpaceRune(runes[j-1]) && (j+1 == len(runes) || !isWord(runes[j+1])) {
					closing = j
					break
				}
			}
			if closing > 0 {
				out = append(out, []rune("<i>")...)
				out = append(out, runes[index+1:closing]...)
				out = append(out, []rune("</i>")...)
				index = closing
				continue
			}
		}
		out = append(out, r)
	}
	return string(out)
}

func isWord(r rune) bool {
	return r == '_' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}

func isSpaceRune(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\f' || r == '\v'
}

func escape(text string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(text)
}

func Render(text string) string { return inline(escape(text)) }

func FromEscaped(text string) string { return inline(text) }
