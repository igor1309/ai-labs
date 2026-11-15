# Notes template files

Templates live in `Templates` beside Audelin's preferences file. Each is a
UTF-8 `.md` file. Its filename without `.md` is its name, which must also
appear in the metadata. Names cannot contain path separators.

The first line is `---`. JSON metadata follows, ending at another `---`
line. The remaining text is the instructions sent with the transcript.
For example, `Follow-up.md` can contain:

```text
---
{
  "name": "Follow-up",
  "headings": [
    [
      { "name": "Continuation", "required": true },
      { "name": "Blockers", "required": true },
      { "name": "Questions", "required": false }
    ]
  ]
}
---
Describe the next steps and blockers. Mark anything not stated as unclear.
```

`headings` holds alternative ordered heading sets, such as English and
Russian. The answer uses one set without mixing languages. Each set needs
at least one required heading and unique, nonempty names. Required headings
appear exactly once, in order; optional headings may be omitted. Every
present section needs content. Section headings use Markdown level two;
nested headings, lists and code blocks are allowed within sections.

The instructions must be nonempty. Faithfulness rules are added separately
to every request. Changing the instructions or headings in `Default.md`
changes the next notes attempt; a running attempt keeps the value it read.

An absent folder is created with `Default.md` and `Daily.md`. Daily asks for a
handoff: work to continue, who does what, blockers and planned fixes, and planned
meetings. It distinguishes agreements from suggestions, marks unstated owners,
dates and fixes as unclear, and labels topics not raised as not discussed.
Existing folders are never replenished. A missing or broken Default uses the built-in Default. Broken
files remain untouched and are listed with their reason alongside that
fallback. Other missing or broken templates fail resolution with their
name and reason.
